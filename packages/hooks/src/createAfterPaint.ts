import { onCleanup } from 'solid-js';

/**
 * `schedule(fn)` on the next animation frame; a new call supersedes the pending one, and cleanup
 * cancels it. Unlike bare rAF, nothing runs against disposed refs.
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
