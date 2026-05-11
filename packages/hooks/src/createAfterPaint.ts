import { onCleanup } from 'solid-js';

/**
 * Returns a `schedule(fn)` that runs `fn` on the next animation frame.
 * A second call before the first fires cancels the pending frame
 * (supersede). Component cleanup cancels any still-pending frame.
 *
 * Use inside `createEffect` / `onMount` when you need post-DOM-flush
 * measurement: popover positioning, focus-after-mount, scroll-indicator
 * update, ResizeObserver-driven reposition.
 *
 * Replaces the bare `requestAnimationFrame(fn)` idiom — the bare version
 * leaks a pending callback past component disposal that runs against a
 * possibly-stale ref. Sites can still keep their inner `if (!ref) return`
 * guards as defense in depth against intra-effect re-runs.
 *
 * Usage:
 *   const afterPaint = createAfterPaint();
 *   createEffect(() => {
 *     if (open()) afterPaint(clampToViewport);
 *   });
 */
export function createAfterPaint(): (fn: () => void) => void {
  let id: number | null = null;
  function schedule(fn: () => void): void {
    if (id !== null) cancelAnimationFrame(id);
    id = requestAnimationFrame(() => {
      id = null;
      fn();
    });
  }
  onCleanup(() => {
    if (id !== null) {
      cancelAnimationFrame(id);
      id = null;
    }
  });
  return schedule;
}
