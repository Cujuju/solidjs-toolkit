import { type Accessor } from 'solid-js';
import { safeAddEventListener, getGlobalTarget } from './_internal/safeEvent';

export interface CreateEscapeKeyOptions {
  /** Optional accessor gating the listener. When returns false, handler is suppressed. */
  enabled?: Accessor<boolean>;
}

/**
 * Fires `handler` on Escape keydown while enabled.
 *
 * @param handler - Callback fired on Escape keydown.
 * @param options - Options object (convention: `enabled` gate lives here).
 */
export function createEscapeKey(
  handler: (e: KeyboardEvent) => void,
  options: CreateEscapeKeyOptions = {},
): void {
  const enabled = options.enabled ?? (() => true);

  const listener = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (!enabled()) return;
    if (ke.key === 'Escape') handler(ke);
  };

  safeAddEventListener(getGlobalTarget('document'), 'keydown', listener);
}
