import { Show, createMemo, createUniqueId, onCleanup, onMount, type JSX } from 'solid-js';
import { useAccordionGroup, type AccordionGroupApi, type PanelBadge } from './context';
import { Chevron, Close, Pin } from './icons';
import { createActivatorKeyDown } from './keys';
import { createPanelMenu } from './panelMenu';
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
   *  this panel only. Any CSS colour; sets `--vsa-accent` on the panel's subtree. */
  accent?: string;
  /** Floor for interactive resize, px. */
  minSize?: number;
  /** Initial size along the growth axis, px. After the user drags a splitter their
   *  size wins and this is ignored. */
  defaultSize?: number;

  /** Skip rendering children until first opened — for expensive content. */
  lazyMount?: boolean;

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

  const onKeyDown = createActivatorKeyDown(group, () => props.id);
  /** One menu instance per panel, attached to whichever chrome this orientation
   *  renders — the header row (vertical) or the column title bar (horizontal). */
  const menu = createPanelMenu(group, () => props.id);
  const dragProps = (): Record<string, unknown> =>
    horizontal() ? {} : group.reorderItemProps(props.id);
  /** Horizontal only: the column title bar is the column's own drag handle. */
  const columnDragProps = (): Record<string, unknown> =>
    horizontal() ? group.reorderColumnProps(props.id) : {};

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
        isLeaf: false,
      },
      props.defaultOpen ?? false,
    );
    if (props.defaultSize !== undefined && group.sizeOf(props.id) === undefined) {
      group.setSize(props.id, props.defaultSize);
    }
  });
  onCleanup(() => {
    group.unregister(props.id);
  });

  /**
   * Explicit size wins over the mode's automatic sizing, for THIS panel only —
   * a group can hold a user-dragged column next to an auto-sized one.
   */
  const sizeStyle = (): JSX.CSSProperties => {
    const px = group.sizeOf(props.id);
    if (px === undefined || !open()) return {};
    return { flex: `0 0 ${px}px` };
  };

  return (
    <div
      ref={(el) => group.setPanelEl(props.id, el)}
      class={`vsa-panel ${props.class ?? ''}`.trim()}
      data-open={open() ? 'true' : 'false'}
      data-pinned={pinned() ? 'true' : 'false'}
      /* The column sitting hard against the rail. Flex `order` decides that
         visually, and CSS has no "first by order" selector — so the component,
         which already knows the open index, says so out loud. Used to drop the
         separator that would otherwise double up against the rail's own edge. */
      data-col-first={horizontal() && group.openIndex(props.id) === 0 ? 'true' : 'false'}
      style={{
        ...(props.accent !== undefined ? { '--vsa-accent': props.accent } : {}),
        ...(horizontal()
          ? { order: Math.max(group.openIndex(props.id), 0) + 1 }
          : /* Vertical panels keep their DOM position but follow the user's dragged
               order via flex `order`, so reordering never remounts content. */
            { order: group.order().indexOf(props.id) + 1 }),
        ...sizeStyle(),
        ...(props.style ?? {}),
      }}
    >
      {/* VERTICAL: the activator is a full-width header bar above the content. */}
      <Show when={!horizontal()}>
        <div class="vsa-header-row" {...menu.triggerProps}>
          <button
            {...dragProps()}
            ref={(el) => {
              group.setHeaderEl(props.id, el);
              const viaDrag = dragProps().ref as ((e: HTMLElement) => void) | undefined;
              viaDrag?.(el);
            }}
            id={headerId}
            type="button"
            class={`vsa-header ${props.headerClass ?? ''}`.trim()}
            title={props.tooltip}
            aria-expanded={open()}
            aria-controls={contentId}
            onClick={() => group.toggle(props.id)}
            onKeyDown={onKeyDown}
          >
            <Chevron />
            <Show when={props.icon}>
              <span class="vsa-icon">{props.icon}</span>
            </Show>
            <span class="vsa-title">{props.title}</span>
            <Show when={props.count !== undefined}>
              <span class="vsa-count">{props.count}</span>
            </Show>
            <Show when={props.badge}>
              <span class="vsa-badge" data-badge={props.badge} aria-hidden="true" />
            </Show>
          </button>

          <div class="vsa-header-tail">
            <Show when={props.actions}>
              <div class="vsa-actions">{props.actions}</div>
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
        <div
          class="vsa-col-bar"
          {...columnDragProps()}
          {...menu.triggerProps}
          ref={(el) => {
            const viaDrag = columnDragProps().ref as ((e: HTMLElement) => void) | undefined;
            viaDrag?.(el);
          }}
        >
          <Show when={props.icon}>
            <span class="vsa-icon">{props.icon}</span>
          </Show>
          <span class="vsa-title" id={headerId}>
            {props.title}
          </span>
          <Show when={props.count !== undefined}>
            <span class="vsa-count">{props.count}</span>
          </Show>
          <div class="vsa-header-tail">
            <Show when={props.actions}>
              <div class="vsa-actions">{props.actions}</div>
            </Show>
            <PanelPinButton group={group} id={props.id} shown={pinnable()} pinned={pinned()} />
            <Show when={closable()}>
              <CloseButton onClick={() => group.setOpen(props.id, false)} />
            </Show>
          </div>
        </div>
      </Show>

      {/* Content stays MOUNTED while collapsed (hidden), so a scroll position, a
          text selection or an in-flight edit inside a panel survives the user
          looking at a sibling. `hidden` keeps it out of the a11y tree and out of
          tab order without unmounting. */}
      <Show when={shouldRender()}>
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          class={`vsa-content ${props.contentClass ?? ''}`.trim()}
          hidden={!open()}
        >
          {props.children}
        </div>
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
        class="vsa-pin"
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
    <button type="button" class="vsa-close" data-no-drag title="Close" onClick={props.onClick}>
      <Close />
    </button>
  );
}
