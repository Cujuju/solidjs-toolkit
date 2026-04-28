import { onCleanup } from 'solid-js';

/**
 * SSR-safe DOM event listener registration. Identical pattern to the one
 * in cujuju-solidjs-hooks/_internal/safeEvent — duplicated here to avoid
 * adding a cross-package dependency. The function is small and its
 * contract is stable; if it grows or drifts, unify via a shared package.
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
