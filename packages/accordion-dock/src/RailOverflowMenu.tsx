import { createSignal, Show, type Accessor, type JSX } from 'solid-js';
import { ContextMenu, type ContextMenuEntry } from '@cujuju/solidjs-context-menu';
import { slotRef, RAIL_OVERFLOW_SLOT_KEY, type AccordionGroupApi } from './context';
import { RAIL_OVERFLOW_ATTR } from './railOverflow';

/**
 * The `⋯` at the end of the rail: the panels that did not fit, reachable as a menu instead of
 * behind a scrollbar. Uses `@cujuju/solidjs-context-menu`, so dismissal semantics cannot drift.
 */

/** Trigger glyph. A horizontal ellipsis rather than a vertical one: it reads as
 *  "continues past here" along the rail's own axis of truncation. */
const OVERFLOW_GLYPH = '⋯';

/** `MouseEvent.detail` on a click with no press behind it — Enter or Space on a
 *  focused button. A pointer-driven click reports its click count instead. */
const KEYBOARD_CLICK_DETAIL = 0;

export interface RailOverflowMenuProps {
  group: AccordionGroupApi;
  /** Panels that did not fit, in rail order. */
  ids: Accessor<readonly string[]>;
  /** Reports the trigger's measured extent back to the overflow controller, which
   *  reserves exactly this much rather than a hardcoded guess. */
  onMeasure?: (px: number) => void;
}

/**
 * Rows for the overflow menu, pure so the set is assertable without a renderer. Every row is
 * enabled: `toggle` is meaningful both ways, so open panels get a checkmark.
 */
export function buildRailOverflowItems(
  group: AccordionGroupApi,
  ids: readonly string[],
): ContextMenuEntry[] {
  return ids.flatMap((id): ContextMenuEntry[] => {
    const meta = group.meta(id);
    // A panel can unregister while its id is still in the rail order; it then contributes
        // no row rather than a blank one.
    if (meta === undefined) return [];
    return [
      {
        label: meta.railLabel() ?? meta.title(),
        // Mirrors the rail button's own open marker, so a panel that scrolled out
        // of the strip does not also lose its state indication.
        checked: group.isOpen(id),
        onClick: () => group.toggle(id),
      },
    ];
  });
}

export function RailOverflowMenu(props: RailOverflowMenuProps): JSX.Element {
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);
  // `group` captured, not read through `props` at cleanup time — see `slotRef`.
  const group = props.group;
  const registerEl = slotRef(group.railOverflowSlot, RAIL_OVERFLOW_SLOT_KEY);
  const close = (): void => {
    setAt(null);
  };

  /**
   * Opens from the trigger's own corner rather than the cursor: this is a MENU BUTTON with one
   * fixed anchor; cursor-positioning would open the same control somewhere new each click.
   */
  const openFromTrigger = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    setAt({ x: r.right, y: r.top });
  };

  /** ContextMenu dismisses on document `mousedown`, then this trigger's `click` would reopen it. Recorded at the press, since `at()` is null by click. */
  let dismissedByThisPress = false;

  const onTriggerMouseDown = (): void => {
    // Native listener at the target, so it runs before the document dismissal. Reassigned every press, so it cannot go stale.
    dismissedByThisPress = at() !== null;
  };

  const onTriggerClick = (e: MouseEvent & { currentTarget: HTMLElement }): void => {
    // A keyboard activation has no `mousedown` behind it, so it can never be the
    // second half of a dismissing press — it always means "open".
    const closesThePress = e.detail !== KEYBOARD_CLICK_DETAIL && dismissedByThisPress;
    dismissedByThisPress = false;
    if (closesThePress) return;
    openFromTrigger(e.currentTarget);
  };

  return (
    <Show when={props.ids().length > 0}>
      <button
        ref={(el) => {
          // Reported once mounted; the controller reserves this instead of a
          // constant, so restyling the trigger cannot silently mis-budget the rail.
          props.onMeasure?.(Math.ceil(el.getBoundingClientRect().height));
          // The trigger STANDS IN for the buttons that did not fit, so the group anchors to it.
                    // Through a slot, so a stale trigger cannot anchor flyouts.
          registerEl(el);
        }}
        type="button"
        class="acc-rail-overflow"
        /* Excluded from drag activation exactly as the pin and close buttons are: without it,
                   pressing the trigger inside the draggable rail would arm a reorder. */
        data-no-drag
        {...{ [RAIL_OVERFLOW_ATTR]: '' }}
        /* Never the Tab stop: overflow always leaves `MIN_VISIBLE_RAIL_ITEMS` tabs on the rail to hold it. Arrow keys reach it. */
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={at() !== null}
        title={`${props.ids().length} more`}
        aria-label={`${props.ids().length} more panels`}
        /* Native, not delegated: Solid's delegated `onMouseDown` also runs at `document`,
           and would beat the menu's dismiss listener only by registration order. */
        on:mousedown={onTriggerMouseDown}
        onClick={onTriggerClick}
      >
        {OVERFLOW_GLYPH}
      </button>

      <Show when={at()}>
        {(point) => (
          <ContextMenu
            items={buildRailOverflowItems(props.group, props.ids())}
            x={point().x}
            y={point().y}
            onClose={close}
          />
        )}
      </Show>
    </Show>
  );
}
