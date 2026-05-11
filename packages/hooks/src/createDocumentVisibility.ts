import { createSignal, type Accessor } from 'solid-js';
import { safeAddEventListener, getGlobalTarget } from './_internal/safeEvent';

/**
 * Reactive `document.visibilityState`. Updates when the user switches tabs
 * or minimises the window.
 */
export function createDocumentVisibility(): Accessor<DocumentVisibilityState> {
  if (typeof document === 'undefined') {
    const [value] = createSignal<DocumentVisibilityState>('visible');
    return value;
  }

  const [state, setState] = createSignal<DocumentVisibilityState>(document.visibilityState);

  const listener = (): void => {
    setState(document.visibilityState);
  };

  safeAddEventListener(getGlobalTarget('document'), 'visibilitychange', listener);

  return state;
}
