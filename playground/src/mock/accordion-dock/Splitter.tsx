import { Show, type JSX } from 'solid-js';
import { useAccordionGroup } from './context';

/**
 * The drag handle on a panel's TRAILING edge — the boundary between it and the next
 * open panel.
 *
 * It is rendered by the panel rather than as a standalone sibling because flex
 * `order` decides visual sequence here: a free-standing splitter element would have
 * to be given an order value interleaved with the columns', and every reorder or
 * open/close would have to re-thread them. Anchoring the handle to the panel it
 * resizes makes that bookkeeping disappear.
 *
 * Renders only when there IS a next open panel — a handle on the last column would
 * resize the group itself, which the group does not own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS A CONTROL, NOT DECORATION.
 *
 * This was a `role="separator"` with no `tabindex`, no key handler and no
 * `aria-value*`: resize was reachable by pointer only. `keys.ts` already states the
 * principle for the other gesture in this control — "drag-to-reorder that has no
 * keyboard equivalent is an accessibility hole, not a missing nicety: a
 * pointer-only affordance makes the feature unreachable rather than awkward" — and
 * reorder duly got Alt+Arrow while resize got nothing.
 *
 * So it is now a focusable window splitter per the ARIA pattern: arrows move the
 * boundary, Shift takes a coarse step, Home/End go to the panel's floor and
 * ceiling. The keys map to the AXIS the panels grow along, which is the axis the
 * handle visibly slides on — Left/Right between columns, Up/Down between stacked
 * panels — so the binding is the one the geometry suggests rather than one to learn.
 */

/** One arrow press. The engine owns the DISTANCE (see `KEYBOARD_STEP_PX` there), so
 *  what this file decides is a direction, not a magnitude. */
const ONE_STEP = 1;

/**
 * Home/End travel: far enough to reach the clamp from anywhere.
 *
 * The engine bounds every movement to the pair's floors, so this only has to exceed
 * any dock's width rather than be measured — asking for 1000 coarse steps and
 * landing exactly on the minimum is the same code path as asking for one and
 * landing 8px away.
 */
const TO_THE_END = 1000;

export function Splitter(props: { id: string }): JSX.Element {
  const group = useAccordionGroup();

  const shown = (): boolean =>
    group.resizable() && group.isOpen(props.id) && group.neighborOpenId(props.id) !== undefined;

  /** Horizontal docks grow along x, so the boundary slides left/right; vertical
   *  ones grow along y. */
  const horizontal = (): boolean => group.orientation() === 'horizontal';

  const bounds = (): { value: number; min: number; max: number } | undefined =>
    group.resizeBoundsOf(props.id);

  const onKeyDown = (e: KeyboardEvent): void => {
    const forward = horizontal() ? 'ArrowRight' : 'ArrowDown';
    const back = horizontal() ? 'ArrowLeft' : 'ArrowUp';

    if (e.key === forward) group.nudgeResize(props.id, ONE_STEP, e.shiftKey);
    else if (e.key === back) group.nudgeResize(props.id, -ONE_STEP, e.shiftKey);
    // Home shrinks to the floor, End grows to the ceiling — the same two numbers
    // the separator reports as `aria-valuemin` / `aria-valuemax`.
    else if (e.key === 'Home') group.nudgeResize(props.id, -TO_THE_END, true);
    else if (e.key === 'End') group.nudgeResize(props.id, TO_THE_END, true);
    else return;

    // Only after a key this handler acted on: arrows must still scroll, and
    // Home/End must still jump, everywhere it did not.
    e.preventDefault();
  };

  return (
    <Show when={shown()}>
      <div
        class="acc-splitter"
        role="separator"
        /* Focusable, because a separator that cannot take focus cannot be operated
           by the keys below. That is the whole difference between a decorative
           divider and a window splitter. */
        tabindex={0}
        aria-orientation={horizontal() ? 'vertical' : 'horizontal'}
        aria-label="Resize panel"
        /* Reported only once the engine can measure the pair. Before the panels
           have laid out there is no honest number, and a separator announcing
           `aria-valuenow="0"` is worse than one announcing nothing: a screen reader
           would read out a position that is not the position. */
        aria-valuenow={bounds()?.value}
        aria-valuemin={bounds()?.min}
        aria-valuemax={bounds()?.max}
        onPointerDown={(e) => group.beginResize(props.id, e)}
        onKeyDown={onKeyDown}
        /* Never a reorder gesture: the two drags share an axis in vertical
           orientation and would otherwise race. */
        data-no-drag
      />
    </Show>
  );
}
