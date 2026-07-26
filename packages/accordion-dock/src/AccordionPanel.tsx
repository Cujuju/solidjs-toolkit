import {
  Show,
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
import { Chevron, Close, Pin } from './icons';
import { createActivatorKeyDown } from './keys';
import { createPanelMenu } from './panelMenu';
import { columnFlex } from './resize';
import { Splitter } from './Splitter';

export interface AccordionPanelProps {
  /** Stable identity within the group — the key for open/pinned/order/size state and
   *  persistence. Must be unique among siblings; it is NOT auto-generated because a
   *  generated id changes on every mount and would break persistence silently. */
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
  /** Show a close (×) on the panel's title bar. Default: true in `horizontal`
   *  (a column with no header chevron needs SOME way to dismiss it), false in
   *  `vertical` (the header itself toggles). */
  closable?: boolean;

  /** Per-panel accent colour — recolours the rail marker, pin and focus ring for
   *  this panel only. Any CSS colour; sets `--acc-accent` on the panel's subtree. */
  accent?: string;
  /** Floor for interactive resize, px. */
  minSize?: number;
  /** Initial size along the growth axis, px — or `'content'` to measure what the
   *  panel actually holds the first time it opens and freeze that (see
   *  `contentSize.ts` for why it freezes rather than tracking). Either way, after
   *  the user drags a splitter their size wins and this is ignored. */
  defaultSize?: AccordionDefaultSize;

  /** Skip rendering children until first opened — for expensive content. */
  lazyMount?: boolean;
  /** Offer the pop-out-to-a-window affordance on this panel's title bar. Default
   *  false: a panel whose content assumes it shares a document with the dock (a
   *  chart syncing to a sibling, say) should not advertise it. */
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
   * See `slotRef`: filling a slot and emptying it are one decision, so they are one
   * call, and the clear is identity-guarded.
   *
   * The id is captured rather than read through `props` at cleanup time — a cleanup
   * that reads reactive state is a throw waiting for the right unmount order, and
   * one throwing cleanup abandons the whole teardown.
   */
  const panelId = props.id;
  const registerHeaderEl = slotRef(group.activators, panelId);
  const registerPanelEl = slotRef(group.panelElements, panelId);
  /** This panel's own column element. The group already collects these in
   *  `panelElements`, but that map is a plain (non-reactive) store the group
   *  measures from — a size seeded on the element's arrival needs to KNOW when it
   *  arrives, which only a signal can say. */
  const [panelEl, setPanelEl] = createSignal<HTMLElement | undefined>();
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
   * The drag ITEM is the whole panel; the header (or column title bar) is only the
   * HANDLE.
   *
   * These were the same element at first — the primitive's `itemProps` bundles the
   * ref and the pointerdown together, so spreading it on the header registered the
   * HEADER as the thing being dragged. The reorder engine then measured header
   * rects and translated a lone 26px bar over a layout that never moved, which in
   * `fill` mode (where a panel's height is flex-derived, not content-derived) looked
   * like nothing was happening at all. Splitting them means the engine measures and
   * moves the panels — the things the user is actually rearranging.
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
   * Mount precedence: a popup WINDOW outranks a flyout overlay outranks the panel's
   * own column.
   *
   * The order is not arbitrary. Torn-off is the most explicit state the user can
   * put a panel in — they moved it to another window — so nothing in this document
   * may claim the content back while that holds. A flyout is transient by
   * definition and yields to it.
   */
  const contentMount = (): HTMLElement | undefined =>
    group.tearOffMountFor(props.id) ?? group.flyoutMountFor(props.id) ?? inlineHost();

  /**
   * Portal calls this with every container it creates, including the replacement it
   * builds when `mount` changes — so it is where the container's box learns where
   * it landed. In a popup the container IS the window's content area; in this
   * document it must not exist as far as layout is concerned.
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
        railClass: () => props.railClass,
        contentId,
        isLeaf: false,
      },
      props.defaultOpen ?? false,
    );
    seedDefaultSize({
      defaultSize: () => props.defaultSize,
      open,
      // The host, not the inline element: a panel whose first open is a FLYOUT
      // has its children living in the flyout, and measuring the empty inline
      // host would freeze the column at its chrome width.
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
      /* The docked shell of a flying-out panel. It stays MOUNTED — it owns the
         refs the group measures and the identity the reorder list tracks — but
         `autoHide.css` takes it out of the column layout, because a flyout is an
         overlay and the columns must not reflow to make room for it.

         Writing this was missed when auto-hide was wired, and the CSS silently
         never fired: the column kept its slot, kept painting its title bar, and
         the flyout floated over it — so the bar covered the flyout's first row
         and pinning appeared to change nothing about the layout. */
      data-flyout={flyoutDataAttr(group.isFlyout(props.id))}
      /* The column sitting hard against the rail. Flex `order` decides that
         visually, and CSS has no "first by order" selector — so the component,
         which already knows the open index, says so out loud. Used to drop the
         separator that would otherwise double up against the rail's own edge. */
      /* Hard against a boundary — the group's outer edge or the rail — so it drops
         the separator that edge already draws. Under the divider TWO columns
         qualify (the leading pinned one and the first one after the rail); with
         the divider off it reduces to the single column next to the rail, which
         is what this attribute has always meant. */
      data-col-first={horizontal() && group.isEdgeColumn(props.id) ? 'true' : 'false'}
      /* The last pinned column: its trailing edge IS the rail. */
      data-rail-boundary={
        horizontal() && group.isRailBoundary(props.id) ? 'true' : 'false'
      }
      style={{
        ...(props.accent !== undefined ? { '--acc-accent': props.accent } : {}),
        ...(horizontal()
          ? { order: group.columnOrder(props.id) }
          : /* Vertical panels keep their DOM position but follow the user's dragged
               order via flex `order`, so reordering never remounts content. */
            { order: group.order().indexOf(props.id) + 1 }),
        ...sizeStyle(),
        ...(props.style ?? {}),
      }}
    >
      {/* VERTICAL: the activator is a full-width header bar above the content. */}
      <Show when={!horizontal()}>
        <div class="acc-header-row" {...menu.triggerProps}>
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

      {/* HORIZONTAL: the activator moved to the rail, so the column keeps only a
          title bar — the place the pin and the close affordance have to live, since
          a rail button is too narrow to carry either. */}
      <Show when={horizontal() && open()}>
        <div class="acc-col-bar" {...menu.triggerProps}>
          {/*
            THE TITLE BAR IS AN ACTIVATOR, not a label.
            Clicking it COLLAPSES the column back to a rail button while the panel
            stays pinned — "put this away, it still docks" — which is the third
            control on a pinned column and the one that makes `pinned` mean "opens
            as a column" rather than "is open". The × beside it is the other half:
            same close, but it drops the pin too. Two paths, two names
            (`collapseKeepPin` / `closeAndUnpin`), deliberately NOT folded into one
            handler — the difference between them is the whole state model.

            A real <button> with `aria-expanded` / `aria-controls` and the SAME
            `createActivatorKeyDown` the vertical header and the rail button use.
            The third activator in this control, and now the third to share that
            helper rather than hand-rolling keyboard support.

            The DRAG HANDLE moves onto this button too, exactly as the vertical
            header does it: the panel is the drag ITEM and its activator is the
            HANDLE. `createReorderList` fires its own pointerdown gesture and the
            click only lands if the pointer never crossed the drag threshold, so a
            reorder cannot end in an accidental collapse.
          */}
          <button
            {...dragHandle()}
            /* Claims the activator slot ONLY when no rail button exists for this
               panel. The slot is what a flyout anchors to, and the docked shell of
               a flying-out panel is `display:none` — so a column bar that
               registered unconditionally would hand the flyout a zero-rect anchor
               and place it in the corner. Under the divider the two are mutually
               exclusive by construction (a button appears exactly when the column
               does not), and this keeps that true rather than assuming it. */
            ref={(el) => {
              if (!group.showsRailButton(props.id)) registerHeaderEl(el);
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
            {/* CLOSE-AND-FORGET. The sibling activator collapses and remembers;
                this one also drops the pin, so the panel's rail button reopens it
                as a flyout like any other unpinned panel. Nothing can be left
                pinned-but-invisible, which is the state that would otherwise have
                no control anywhere to undo it. */}
            <Show when={closable()}>
              <CloseButton onClick={() => group.closeAndUnpin(props.id)} />
            </Show>
          </div>
        </div>
      </Show>

      {/* Content stays MOUNTED while collapsed (hidden), so a scroll position, a
          text selection or an in-flight edit inside a panel survives the user
          looking at a sibling. `hidden` keeps it out of the a11y tree and out of
          tab order without unmounting. */}
      {/*
        ONE Portal whose mount toggles — never a <Show> swapping an inline branch
        for a portalled one.

        Portal caches its children memo and reads `mount` inside an effect, so
        changing the mount MOVES the existing nodes and keeps the reactive graph
        intact. Swapping branches would re-evaluate the children and destroy
        exactly the scroll position and in-flight edits that this panel's
        stay-mounted-while-collapsed rule exists to protect — the same mechanism
        the tear-off module documents for popup windows.

        That is why the docked case portals too, into an empty host div right here
        rather than rendering directly: it makes docked and flying-out the SAME
        code path with a different mount, so promoting a flyout to a column cannot
        remount anything. A plain `mount={undefined}` would not do — Portal
        defaults to document.body.
      */}
      <div
        ref={setInlineHost}
        id={contentId}
        /*
         * The role follows the ACTIVATOR, because the two orientations are two
         * different ARIA patterns wearing the same component.
         *
         * Horizontal puts every activator in one `role="tablist"` rail, so the
         * content each one reveals is a `tabpanel` — and the rail button now names
         * it with `aria-controls`. Vertical is a disclosure: a header button with
         * `aria-expanded` revealing a `region`. Calling both a `region` left the
         * rail's tabs controlling nothing at all.
         */
        role={horizontal() ? 'tabpanel' : 'region'}
        /*
         * Referenced only when the labelling element EXISTS.
         *
         * In horizontal, `headerId` sits on the column title bar, which renders
         * only while the panel is open — so a closed panel pointed
         * `aria-labelledby` at an id that was not in the document. A dangling
         * reference is not a harmless one: it leaves the region with no accessible
         * name at all, which is worse than the fallback.
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
        <Pin />
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
