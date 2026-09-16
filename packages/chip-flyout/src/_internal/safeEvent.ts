import { onCleanup } from 'solid-js';

/**
 * SSR-safe listener registration: no-ops without `window` or `target`, and removal hooks into
 * the reactive scope's cleanup. Every DOM path here uses it. Duplicated from
 * `@cujuju/solidjs-hooks` per the toolkit convention.
 */
export function safeAddEventListener(
  target: EventTarget | null | undefined,
  event: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): void {
  if (typeof window === 'undefined' || !target) return;
  target.addEventListener(event, listener, options);
  onCleanup(() => target.removeEventListener(event, listener, options));
}

/**
 * Returns whichever global EventTarget is appropriate, or null on SSR.
 */
export function getGlobalTarget(
  which: 'document' | 'window',
): EventTarget | null {
  if (typeof window === 'undefined') return null;
  return which === 'window' ? window : document;
}
