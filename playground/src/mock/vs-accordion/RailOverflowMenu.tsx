import { createSignal, Show, type Accessor, type JSX } from 'solid-js';
import { ContextMenu, type ContextMenuEntry } from '@cujuju/solidjs-context-menu';
import type { AccordionGroupApi } from './context';
import { RAIL_OVERFLOW_ATTR } from './railOverflow';

/**
 * MOCK — same status as the rest of this directory.
 *
 * The `⋯` at the end of the rail: the panels that did not fit, reachable as a
 * menu instead of behind a scrollbar.
 *
 * The menu itself is `@cujuju/solidjs-context-menu` — the same package Phase 4's
 * panel menu uses. Positioning, top-layer promotion, outside-click and Escape
 * dismissal are all solved there, and a second implementation of dismissal
 * semantics inside the accordion would drift from the first one the moment either
 * is touched.
 */

/** Trigger glyph. A horizontal ellipsis rather than a vertical one: it reads as
 *  "continues past here" along the rail's own axis of truncation. */
const OVERFLOW_GLYPH = '⋯';

export interface RailOverflowMenuProps {
  group: AccordionGroupApi;
  /** Panels that did not fit, in rail order. */
  ids: Accessor<readonly string[]>;
  /** Reports the trigger's measured extent back to the overflow controller, which
   *  reserves exactly this much rather than a hardcoded guess. */
  onMeasure?: (px: number) => void;
}

/**
 * Rows for the overflow menu.
 *
 * Exported and pure for the same reason `buildPanelMenuItems` is: the interesting
 * part is which panels appear and what state they show, and that should be
 * assertable without a renderer.
 *
 * Every row is enabled. Unlike the panel context menu — where "Close" on an
 * already-closed panel is a real no-op worth greying out — a rail button's action
 * is `toggle`, which is meaningful in both directions. The open ones are marked
 * with a checkmark rather than disabled, because the row's job here is to be the
 * rail button it replaced, and a rail button never disables itself.
 */
export function buildRailOverflowItems(
  group: AccordionGroupApi,
  ids: readonly string[],
): ContextMenuEntry[] {
  return ids.flatMap((id): ContextMenuEntry[] => {
    const meta = group.meta(id);
    // A panel can unregister while its id is still in the rail order; until it
    // remounts there is no label and no meaningful target, so it contributes no
    // row rather than a blank one.
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
  const close = (): void => {
    setAt(null);
  };

  /**
   * Opens from the trigger's own corner rather than the cursor.
   *
   * This is a MENU BUTTON, not a context menu: it has one fixed anchor and the
   * user expects the panel to appear attached to it. Cursor-positioning would
   * make the same control open in a different place on every click.
   */
  const openFromTrigger = (el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    setAt({ x: r.right, y: r.top });
  };

  return (
    <Show when={props.ids().length > 0}>
      <button
        ref={(el) => {
          // Reported once mounted; the controller reserves this instead of a
          // constant, so restyling the trigger cannot silently mis-budget the rail.
          props.onMeasure?.(Math.ceil(el.getBoundingClientRect().height));
        }}
        type="button"
        class="vsa-rail-overflow"
        /* Excluded from drag activation exactly as the pin and close buttons are —
           without it, pressing the trigger inside the draggable rail would arm a
           reorder. Also how `railPan` tells a control from bare background. */
        data-no-drag
        {...{ [RAIL_OVERFLOW_ATTR]: '' }}
        aria-haspopup="menu"
        aria-expanded={at() !== null}
        title={`${props.ids().length} more`}
        aria-label={`${props.ids().length} more panels`}
        onClick={(e) => openFromTrigger(e.currentTarget)}
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
