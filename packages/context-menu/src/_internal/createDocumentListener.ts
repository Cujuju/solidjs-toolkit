import { onMount, onCleanup } from 'solid-js';

/**
 * Attach a listener to `document` for the owner's mount lifetime.
 *
 * Package-private. A thin wrapper over the
 * `onMount` + `addEventListener` + `onCleanup` triple, for global
 * keyboard/pointer listeners that should be active while a component is
 * mounted and removed on unmount. The target (`document`) always
 * exists, so no reactive ref tracking is needed.
 */
export function createDocumentListener<K extends keyof DocumentEventMap>(
  event: K,
  handler: (e: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void {
  onMount(() => {
    const listener = handler as EventListener;
    document.addEventListener(event, listener, options);
    onCleanup(() => document.removeEventListener(event, listener, options));
  });
}
