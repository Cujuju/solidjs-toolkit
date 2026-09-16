import { createSignal, createRenderEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * Signal lagging `source` by `ms`; changes reset the delay. `createRenderEffect` schedules
 * synchronously, so fake timers are predictable.
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
