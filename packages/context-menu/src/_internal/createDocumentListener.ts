import { onMount, onCleanup } from 'solid-js';

/**
 * Attach a `document` listener for the owner's mount lifetime. Package-private wrapper over
 * onMount + addEventListener + onCleanup.
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
