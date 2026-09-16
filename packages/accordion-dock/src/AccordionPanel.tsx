import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { flyoutDataAttr } from './autoHide';
import { seedDefaultSize, type AccordionDefaultSize } from './contentSize';
import {
  slotRef,
  useAccordionGroup,
  type AccordionGroupApi,
  type PanelBadge,
} from './context';
import { Chevron, Close, Pin, PinOff } from './icons';
import { createActivatorKeyDown } from './keys';
import { createPanelMenu } from './panelMenu';
import { columnFlex } from './resize';
import { Splitter } from './Splitter';

export interface AccordionPanelProps {
  /** Stable identity within the group — the key for open/pinned/order/size state. Must be
   *  unique among siblings; NOT auto-generated, which would break persistence on remount. */
  id: string;
  title: string | JSX.Element;
  children: JSX.Element;

  /** Trailing count badge, e.g. `Errors (3)`. */
  count?: number;
  /** State dot on the rail button and header — "needs attention", no number. */
  badge?: PanelBadge;
  /** Leading glyph. Shown in the vertical header AND on the rail button. */
  icon?: JSX.Element;
  /** Shorter label for the rail button, when the full title is too long rotated. */
  railLabel?: string | JSX.Element;
  /** Native tooltip on the activator. */
  tooltip?: string;
  /** Right-aligned controls in the panel's own header/title bar. Clicks do NOT toggle. */
  actions?: JSX.Element;

  /** Open on first render, when no persisted state exists. */
  defaultOpen?: boolean;
  /** Set false for a panel that must always obey the accordion. Default true. */
  pinnable?: boolean;
  /** Show a close (×) on the panel's title bar. Default: true in `horizontal`, false in
   *  `vertical`, where the header itself toggles. */
  closable?: boolean;

  /** Per-panel accent colour — recolours the rail marker, pin and focus ring for
   *  this panel only. Any CSS colour; sets `--acc-accent` on the panel's subtree. */
  accent?: string;
  /** Floor for interactive resize, px. */
  minSize?: number;
  /**
   * This panel absorbs the group's leftover extent in `fill` mode. With no declaration the job
   * falls to the TRAILING member. See DESIGN_NOTES.md § src/AccordionPanel.tsx:62.
   */
  grow?: boolean;
  /**
   * This panel is never larger than its own content: its size becomes a CEILING. Overrides
   * `grow`. See DESIGN_NOTES.md § src/AccordionPanel.tsx:79.
   */
  shrinkToContent?: boolean;
  /** Initial size along the growth axis, px — or `'content'` to measure and freeze what the
   *  panel first holds. A user's drag always wins over it. */
  defaultSize?: AccordionDefaultSize;

  /** Skip rendering children until first opened — for expensive content. */
  lazyMount?: boolean;
  /** Offer the pop-out-to-a-window affordance. Default false: a panel whose content assumes it
   *  shares a document with the dock should not advertise it. */
  tearOffable?: boolean;

  class?: string;
  headerClass?: string;
  contentClass?: string;
  railClass?: string;
  style?: JSX.CSSProperties;
}

export function AccordionPanel(props: AccordionPanelProps): JSX.Element {
  const group = useAccordionGroup();

  const baseId = createUniqueId();
  const headerId = `${baseId}-header`;
  const contentId = `${baseId}-content`;

  const open = (): boolean => group.isOpen(props.id);
  const pinned = (): boolean => group.isPinned(props.id);
  const pinnable = (): boolean => props.pinnable ?? true;
  const horizontal = (): boolean => group.orientation() === 'horizontal';
  const closable = (): boolean => props.closable ?? horizontal();


  /**
   * See `slotRef`: filling a slot and emptying it are one decision. The id is captured, not
   * read at cleanup time — a cleanup that reads reactive state can throw.
   */
  const panelId = props.id;
  const registerHeaderEl = slotRef(group.activators, panelId);
  const registerPanelEl = slotRef(group.panelElements, panelId);
  /** This panel's own column element. The group's `panelElements` map is non-reactive, and a
   *  size seeded on arrival needs to KNOW when it arrives. */
  const [panelEl, setPanelEl] = createSignal<HTMLElement | undefined>();
  /** The column title bar's activator. A signal, not a `slotRef`: whether it claims the slot is
   *  reactive, and a ref runs once. */
  const [colBarEl, setColBarEl] = createSignal<HTMLElement | undefined>();

  /** Holds the activator slot only while no rail button exists. Released through the identity-guarded `clear`, so it never deletes the rail button's entry. */
  createEffect(() => {
    const el = colBarEl();
    if (el === undefined || group.showsRailButton(panelId)) return;
    group.activators.set(panelId, el);
    onCleanup(() => {
      group.activators.clear(panelId, el);
    });
  });
  const afterPaint = createAfterPaint();
  /** One menu instance per panel, attached to whichever chrome this orientation
   *  renders — the header row (vertical) or the column title bar (horizontal). */
  const menu = createPanelMenu(group, () => props.id);
  // One `onKeyDown` per element, so the menu binding lives inside the activator's
  // key handler rather than competing with it — see `createActivatorKeyDown`.
  const onKeyDown = createActivatorKeyDown(group, () => props.id, {
    onMenu: (el) => menu.openAtElement(el),
  });
  /**
   * The drag ITEM is the whole panel; the header is only the HANDLE. See DESIGN_NOTES.md
   * § src/AccordionPanel.tsx:169.
   */
  const dragItem = (): Record<string, unknown> =>
    horizontal() ? group.reorderColumnProps(props.id) : group.reorderItemProps(props.id);

  /** Just the gesture starter, for the handle element. */
  const dragHandle = (): Record<string, unknown> => {
    const onPointerDown = dragItem().onPointerDown;
    return onPointerDown === undefined ? {} : { onPointerDown };
  };

  /** Ref + drag classes + the engine's id attribute, for the panel element. */
  const dragItemAttrs = (): Record<string, unknown> => {
    const { ref: _ref, onPointerDown: _down, ...rest } = dragItem();
    return rest;
  };

  /** The panel's own inline content box — the default Portal target. */
  const [inlineHost, setInlineHost] = createSignal<HTMLElement | undefined>();

  /** Flyout host wins when the panel is an overlay; otherwise the content lives in
   *  its column. Undefined only until the inline host's ref has fired. */
  /**
   * Mount precedence: a popup WINDOW outranks a flyout outranks the column. Torn-off is the
   * most explicit state the user can choose, so nothing here may claim the content back.
   */
  const contentMount = (): HTMLElement | undefined =>
    group.tearOffMountFor(props.id) ?? group.flyoutMountFor(props.id) ?? inlineHost();

  /**
   * Portal calls this with every container it creates, so it is where the container's box
   * learns where it landed: the window's content area, or nothing at all.
   */
  const decorateContainer = (container: HTMLElement): void => {
    if (group.isTornOff(props.id)) {
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = '1 1 auto';
      container.style.minHeight = '0';
      return;
    }
    container.style.display = 'contents';
  };

  /** Latches once the panel has ever been open — the gate for `lazyMount`. */
  const everOpen = createMemo<boolean>((prev) => prev || open(), false);
  const shouldRender = (): boolean => (props.lazyMount ? everOpen() : true);

  onMount(() => {
    group.register(
      {
        id: props.id,
        // Accessors, not values — the group renders these on the rail in
        // `horizontal`, and a snapshot would freeze a live count.
        title: () => props.title,
        railLabel: () => props.railLabel,
        count: () => props.count,
        badge: () => props.badge,
        icon: () => props.icon,
        tooltip: () => props.tooltip,
        accent: () => props.accent,
        pinnable,
        closable,
        minSize: () => props.minSize,
        grow: () => props.grow ?? false,
        railClass: () => props.railClass,
        contentId,
        isLeaf: false,
      },
      props.defaultOpen ?? false,
    );
    seedDefaultSize({
      defaultSize: () => props.defaultSize,
      open,
      // The host, not the inline element: a panel whose first open is a FLYOUT has its children
      // there, so the empty inline host would measure as chrome width.
      host: contentMount,
      panel: panelEl,
      sizeOf: () => group.sizeOf(props.id),
      setSize: (px) => group.setSize(props.id, px),
      orientation: group.orientation,
      afterPaint,
    });
  });
  onCleanup(() => {
    group.unregister(props.id);
  });

  /**
   * Explicit size wins over the mode's automatic sizing, for THIS panel only —
   * a group can hold a user-dragged column next to an auto-sized one.
   */
  const sizeStyle = (): JSX.CSSProperties => {
    if (!open()) return {};
    return columnFlex({
      sizePx: group.sizeOf(props.id),
      fill: group.mode() === 'fill',
      trailing: group.neighborOpenId(props.id) === undefined,
      declaresGrow: props.grow ?? false,
      groupHasDeclaredGrower: group.hasDeclaredGrower(),
      shrinkToContent: props.shrinkToContent ?? false,
      axis: group.orientation() === 'horizontal' ? 'width' : 'height',
    });
  };

  return (
    <div
      {...dragItemAttrs()}
      ref={(el) => {
        registerPanelEl(el);
        setPanelEl(el);
        // The reorder primitive registers its node through `itemProps.ref`; Solid
        // lets the later ref win, so it is invoked explicitly rather than dropped.
        (dragItem().ref as ((e: HTMLElement) => void) | undefined)?.(el);
      }}
      class={`acc-panel ${props.class ?? ''}`.trim()}
      data-open={open() ? 'true' : 'false'}
      data-pinned={pinned() ? 'true' : 'false'}
      /* The docked shell of a flying-out panel: still MOUNTED, owning the refs the group
               measures, but `autoHide.css` takes it out of the column layout. */
      data-flyout={flyoutDataAttr(group.isFlyout(props.id))}
      /* The column against the rail. Flex `order` decides that visually, and CSS has no
               "first by order" selector — so the component says so out loud. */
      /* Hard against a boundary — the group's edge or the rail — so it drops the separator
               that edge already draws. Under the divider TWO columns qualify. */
      data-col-first={horizontal() && group.isEdgeColumn(props.id) ? 'true' : 'false'}
      /* The last pinned column: its trailing edge IS the rail. */
      data-rail-boundary={
        horizontal() && group.isRailBoundary(props.id) ? 'true' : 'false'
      }
      style={{
        ...(props.accent !== undefined ? { '--acc-accent': props.accent } : {}),
        ...(horizontal()
          ? { order: group.columnOrder(props.id) }
          : /* Vertical panels keep their DOM position but follow the dragged
                         order via flex `order`, so reordering never remounts content. */
            { order: group.order().indexOf(props.id) + 1 }),
        ...sizeStyle(),
        ...(props.style ?? {}),
      }}
    >
      {/* VERTICAL: the activator is a full-width header bar above the content. */}
      <Show when={!horizontal()}>
        {/* The vertical activator. Under auto-hide it is also the flyout's ANCHOR and
                    hover target — the role the rail button plays in horizontal. */}
        <div
          class="acc-header-row"
          {...group.activatorHoverProps(props.id)}
          {...menu.triggerProps}
        >
          <button
            {...dragHandle()}
            ref={registerHeaderEl}
            id={headerId}
            type="button"
            class={`acc-header ${props.headerClass ?? ''}`.trim()}
            title={props.tooltip}
            aria-expanded={open()}
            aria-controls={contentId}
            onClick={() => group.toggle(props.id)}
            onKeyDown={onKeyDown}
          >
            <Chevron />
            <Show when={props.icon}>
              <span class="acc-icon">{props.icon}</span>
            </Show>
            <span class="acc-title">{props.title}</span>
            <Show when={props.count !== undefined}>
              <span class="acc-count">{props.count}</span>
            </Show>
            <Show when={props.badge}>
              <span class="acc-badge" data-badge={props.badge} aria-hidden="true" />
            </Show>
          </button>

          <div class="acc-header-tail">
            <Show when={props.actions}>
              <div class="acc-actions">{props.actions}</div>
            </Show>
            <PanelPinButton group={group} id={props.id} shown={pinnable()} pinned={pinned()} />
            <Show when={closable() && open()}>
              <CloseButton onClick={() => group.setOpen(props.id, false)} />
            </Show>
          </div>
        </div>
      </Show>

      {/* HORIZONTAL: the activator moved to the rail, so the column keeps only a title
                bar — where the pin and close must live, a rail button being too narrow. */}
      <Show when={horizontal() && open()}>
        <div class="acc-col-bar" {...menu.triggerProps}>
          {/*
                                THE TITLE BAR IS AN ACTIVATOR, not a label: clicking it collapses the column
                                while the panel stays pinned. See DESIGN_NOTES.md § src/AccordionPanel.tsx:392.
                              */}
          <button
            {...dragHandle()}
            /* Claims the activator slot ONLY when no rail button exists. A column bar that
                           registered unconditionally would hand a flyout a zero-rect anchor, the
                           docked shell being `display:none`. */
            ref={(el) => {
              setColBarEl(el);
              // Released on unmount, as `slotRef` did, so the effect never holds a detached bar.
              onCleanup(() => setColBarEl(undefined));
            }}
            id={headerId}
            type="button"
            class="acc-col-activator"
            title={props.tooltip}
            aria-expanded={open()}
            aria-controls={contentId}
            onClick={() => group.collapseKeepPin(props.id)}
            onKeyDown={onKeyDown}
          >
            <Show when={props.icon}>
              <span class="acc-icon">{props.icon}</span>
            </Show>
            <span class="acc-title">{props.title}</span>
            <Show when={props.count !== undefined}>
              <span class="acc-count">{props.count}</span>
            </Show>
          </button>
          <div class="acc-header-tail">
            <Show when={props.actions}>
              <div class="acc-actions">{props.actions}</div>
            </Show>
            <PanelPinButton group={group} id={props.id} shown={pinnable()} pinned={pinned()} />
            <Show when={props.tearOffable ?? false}>
              <button
                type="button"
                class="acc-tearoff"
                data-no-drag
                aria-pressed={group.isTornOff(props.id)}
                title={group.isTornOff(props.id) ? 'Dock this panel' : 'Open in a new window'}
                /* Synchronous in the click handler on purpose: window.open needs
                   transient user activation, and an await or a timeout spends it. */
                onClick={() =>
                  group.isTornOff(props.id) ? group.dock(props.id) : group.tearOff(props.id)
                }
              >
                {group.isTornOff(props.id) ? '⤓' : '⤢'}
              </button>
            </Show>
            {/* CLOSE-AND-FORGET. The sibling activator collapses and remembers; this one
                            drops the pin too, so nothing is left pinned-but-invisible. */}
            <Show when={closable()}>
              <CloseButton onClick={() => group.closeAndUnpin(props.id)} />
            </Show>
          </div>
        </div>
      </Show>

      {/* Content stays MOUNTED while collapsed, so a scroll position or in-flight edit
                survives looking at a sibling. `hidden` keeps it out of the a11y tree. */}
      {/*
                    ONE Portal whose mount toggles — never a <Show> swapping branches, which would
                    destroy the state the stay-mounted rule protects.
                    See DESIGN_NOTES.md § src/AccordionPanel.tsx:483.
                  */}
      <div
        ref={setInlineHost}
        id={contentId}
        /*
                 * The role follows the ACTIVATOR: horizontal's rail is a `tablist`, so content is a
                 * `tabpanel`; vertical is a disclosure revealing a `region`.
                 */
        role={horizontal() ? 'tabpanel' : 'region'}
        /*
                 * Referenced only when the labelling element EXISTS. In horizontal `headerId` sits on
                 * the column bar, which renders only while open — a dangling reference leaves the
                 * region with no name.
                 */
        aria-labelledby={!horizontal() || open() ? headerId : undefined}
        class={`acc-content ${props.contentClass ?? ''}`.trim()}
        hidden={!open() || group.isFlyout(props.id) || group.isTornOff(props.id)}
      />
      <Show when={shouldRender() && contentMount()}>
        {(mount) => (
          <Portal mount={mount()} ref={decorateContainer}>
            {props.children}
          </Portal>
        )}
      </Show>

      <Splitter id={props.id} />
      {menu.element}
    </div>
  );
}

/** Shared so the vertical header and the horizontal column bar cannot drift. */
function PanelPinButton(props: {
  group: AccordionGroupApi;
  id: string;
  shown: boolean;
  pinned: boolean;
}): JSX.Element {
  return (
    <Show when={props.shown}>
      <button
        type="button"
        class="acc-pin"
        /* Excluded from drag activation — see REORDER_SKIP_SELECTOR. Without this,
           pressing the pin inside a draggable header would start a reorder. */
        data-no-drag
        aria-pressed={props.pinned}
        title={
          props.pinned
            ? 'Pinned — stays open when another panel is opened'
            : 'Pin — keep open when another panel is opened'
        }
        onClick={() => props.group.togglePin(props.id)}
      >
        {/* The glyph shows the STATE, not the action: `aria-pressed` already names the
                    action, and an icon that flips to the verb makes "is it pinned?" unanswerable. */}
        <Show when={props.pinned} fallback={<PinOff />}>
          <Pin />
        </Show>
      </button>
    </Show>
  );
}

function CloseButton(props: { onClick: () => void }): JSX.Element {
  return (
    <button type="button" class="acc-close" data-no-drag title="Close" onClick={props.onClick}>
      <Close />
    </button>
  );
}
