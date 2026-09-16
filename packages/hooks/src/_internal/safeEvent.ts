import { onCleanup } from 'solid-js';

/**
 * SSR-safe listener: no-op without `window` or `target`; removal hooks into the reactive scope's
 * cleanup. Every DOM hook here must use it, never `addEventListener`.
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
 * Convenience — returns whichever global EventTarget is appropriate,
 * or null on SSR. Hooks that conditionally target `document` or `window`
 * can resolve the right reference without repeating the SSR check.
 */
export function getGlobalTarget(which: 'document' | 'window'): EventTarget | null {
  if (typeof window === 'undefined') return null;
  return which === 'window' ? window : document;
}
