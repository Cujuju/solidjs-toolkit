import { createEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * Observes viewport intersection for the referenced element. Calls `handler`
 * on every intersection change with the matching `IntersectionObserverEntry`.
 */
export function createIntersectionObserver(
  elAccessor: Accessor<Element | undefined>,
  handler: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit,
): void {
  createEffect(() => {
    const el = elAccessor();
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) handler(entry);
    }, options);
    io.observe(el);
    onCleanup(() => io.disconnect());
  });
}
