import { type Accessor } from 'solid-js';
import { safeAddEventListener, getGlobalTarget } from './_internal/safeEvent';

export interface CreateClickOutsideOptions {
  /** Reactive gate. When returns false, handler is suppressed. */
  enabled?: Accessor<boolean>;
}

/**
 * Fires `handler` when a `pointerdown` lands outside the surface defined by `isInside`.
 *
 * The surface is described by a predicate `(target) => boolean` rather than a single
 * element ref. This lets callers express:
 *   - Single ref:  `(t) => menuEl?.contains(t) ?? false`
 *   - Multi-ref:   `(t) => buttonRef?.contains(t) || panelRef?.contains(t) || false`
 *   - Selector:    `(t) => (t as Element).closest('[data-flyout]') !== null`
 *
 * The companion helper `contains(...)` covers the common ref-based cases.
 *
 * Capture-phase listener — children that call `e.stopPropagation()` on pointerdown
 * cannot silently break this hook (a well-known footgun in bubble-phase implementations).
 *
 * `pointerdown` covers mouse, touch, and pen with a single trigger; for mouse it fires
 * before `mousedown`, so this is at least as eager as the previous `mousedown` default.
 *
 * Opening-gesture suppression: events whose `timeStamp` predates listener attachment
 * are ignored. This handles the case where the same gesture that opened the floating
 * UI is still propagating when the listener attaches (e.g., menu opened on `contextmenu`,
 * or popover opened on `click`). It works because Solid's `createEffect` runs synchronously
 * inside the opening event's dispatch — any in-flight event from that gesture has a
 * timestamp set before `attachTime`, while every future user gesture's events have a
 * timestamp set after attachment.
 *
 * @param isInside - Predicate returning true when the event target should be treated as inside.
 * @param handler  - Called with the original event when an outside pointerdown fires.
 * @param options  - Convention: `enabled` gate lives here.
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
