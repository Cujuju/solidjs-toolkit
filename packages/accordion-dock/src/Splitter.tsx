import { Show, type JSX } from 'solid-js';
import { useAccordionGroup } from './context';

/**
 * The drag handle on a panel's TRAILING edge. A focusable window splitter, operable by arrows,
 * not decoration. See DESIGN_NOTES.md § src/Splitter.tsx:4.
 */

/** One arrow press. The engine owns the DISTANCE (see `KEYBOARD_STEP_PX` there), so
 *  what this file decides is a direction, not a magnitude. */
const ONE_STEP = 1;

/**
 * Home/End travel: far enough to reach the clamp from anywhere. The engine bounds every
 * movement to the pair's floors, so this only has to exceed any dock's width.
 */
const TO_THE_END = 1000;

export function Splitter(props: { id: string }): JSX.Element {
  const group = useAccordionGroup();

  /**
   * SUPPRESSED ON THE RAIL BOUNDARY: the last pinned column's trailing edge is the rail, and a
   * boundary does not resize. See DESIGN_NOTES.md § src/Splitter.tsx:51.
   */
  const shown = (): boolean =>
    group.resizable() &&
    group.isOpen(props.id) &&
    !group.isRailBoundary(props.id) &&
    group.neighborOpenId(props.id) !== undefined;

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
        /* Reported only once the engine can measure the pair: a separator announcing
                   `aria-valuenow="0"` reads out a position that is not the position. */
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
