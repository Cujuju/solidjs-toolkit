import { onCleanup } from 'solid-js';

/**
 * SSR-safe listener registration. Duplicated from `@cujuju/solidjs-hooks` rather than adding a
 * cross-package dependency; unify if it grows.
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
