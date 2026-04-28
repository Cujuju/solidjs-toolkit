import { createEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * Observes size changes on the referenced element. Calls `handler` with the
 * latest `ResizeObserverEntry` whenever the element's size changes.
 */
export function useResizeObserver(
  elAccessor: Accessor<Element | undefined>,
  handler: (entry: ResizeObserverEntry) => void,
): void {
  createEffect(() => {
    const el = elAccessor();
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) handler(entry);
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });
}
