import { type Accessor } from 'solid-js';
import { safeAddEventListener, getGlobalTarget } from './_internal/safeEvent';

export interface CreateClickOutsideOptions {
  /** Reactive gate. When returns false, handler is suppressed. */
  enabled?: Accessor<boolean>;
}

/**
 * Fires `handler` on capture-phase `pointerdown` outside `isInside` (see `contains`). Events
 * timestamped before attach are ignored, so the opening gesture can't immediately dismiss.
 */
export function createClickOutside(
  isInside: (target: Node) => boolean,
  handler: (e: Event) => void,
  options: CreateClickOutsideOptions = {},
): void {
  const enabled = options.enabled ?? ((): boolean => true);
  const attachTime = typeof performance !== 'undefined' ? performance.now() : 0;

  const listener = (e: Event): void => {
    if (!enabled()) return;
    if (e.timeStamp < attachTime) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (isInside(target)) return;
    handler(e);
  };

  safeAddEventListener(
    getGlobalTarget('document'),
    'pointerdown',
    listener,
    { capture: true },
  );
}
