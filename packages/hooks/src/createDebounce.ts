import { createSignal, createRenderEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * Returns a signal whose value lags `source` by `ms` milliseconds. Rapid
 * source changes reset the delay — only the final value after `ms` of
 * stillness is emitted.
 *
 * Uses `createRenderEffect` (synchronous) so the timer is scheduled in the
 * same tick as a source change — predictable under fake timers.
 */
export function createDebounce<T>(source: Accessor<T>, ms: number): Accessor<T> {
  const [debounced, setDebounced] = createSignal<T>(source());
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let firstRun = true;

  createRenderEffect(() => {
    const next = source();
    if (firstRun) {
      firstRun = false;
      return; // no delay on initial value — already set
    }
    if (timerId !== undefined) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = undefined;
      (setDebounced as unknown as (v: T) => void)(next);
    }, ms);
  });

  onCleanup(() => {
    if (timerId !== undefined) clearTimeout(timerId);
  });

  return debounced;
}
