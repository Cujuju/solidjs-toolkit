import { onCleanup } from 'solid-js';

/**
 * SSR-safe DOM event listener registration. No-ops on server render
 * (where `window` is undefined or `target` is null). On client, registers
 * the listener and hooks its removal into the current reactive scope's
 * cleanup — no manual `onCleanup` needed at the caller.
 *
 * This is the primitive every DOM-touching code path in this package
 * uses so we get one SSR strategy, one cleanup contract. No code below
 * this file should call `addEventListener` directly.
 *
 * Duplicated from `@cujuju/solidjs-hooks/_internal/safeEvent.ts` per the
 * toolkit CONTRIBUTING convention (duplicate the primitive; unify only
 * once drift becomes a real problem).
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
