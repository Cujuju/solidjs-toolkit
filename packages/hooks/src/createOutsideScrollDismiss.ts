import { createEffect, onCleanup } from 'solid-js';

/**
 * Dismiss a popover/flyout when the page scrolls outside it.
 *
 * Anchored panels desynchronize from their anchor when the page
 * scrolls. The conventional fix is to close on scroll — but the panel
 * itself often contains scrollable content (workspace lists, chip
 * lists, indicator rows) that the user expects to wheel-scroll without
 * dismissing the panel. Filter scroll events whose target lives inside
 * the panel.
 *
 * `shouldSuppress` extends the in-panel filter to descendant surfaces
 * that live OUTSIDE `panelEl` in the DOM (Portal'd popovers, modal
 * dialogs). The click-path equivalent in app-side flyout panels uses
 * the same predicate shape — `el.closest('[data-flyout-descendant],
 * dialog:modal')` — so wheel-scroll inside a Portal'd descendant
 * popover doesn't dismiss the parent flyout. Without this hook, the
 * parent's scroll listener sees the descendant scroll as "outside"
 * because Portal mounts the descendant to document.body as a sibling
 * of the parent, not a descendant.
 *
 * `capture: true` is required to catch scrolls on non-window scroll
 * containers (e.g. an inner `.app-content`, which doesn't bubble
 * scroll events to window). The listener is gated on `getOpen()` so
 * closed panels pay zero per-frame cost. Cleanup symmetric — same
 * `capture: true` passed to `removeEventListener`.
 */
export function createOutsideScrollDismiss(
  getOpen: () => boolean,
  getPanelEl: () => Node | null | undefined,
  onDismiss: () => void,
  shouldSuppress?: (target: EventTarget | null) => boolean,
): void {
  createEffect(() => {
    if (!getOpen()) return;
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      const panel = getPanelEl();
      // Bail when the panel ref hasn't populated yet — the consumer
      // flipped open() but Solid hasn't committed the JSX yet, or
      // we're racing the very first render. Without this guard,
      // panel?.contains(target) returns undefined (falsy) and any
      // pre-mount scroll event (touchpad fling, mid-wheel-tick at
      // open time) dismisses the just-opened panel before the user
      // sees it. Anchor desync only matters after the panel paints.
      if (!panel) return;
      if (target && panel.contains(target)) return;
      if (shouldSuppress?.(e.target)) return;
      onDismiss();
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    onCleanup(() => {
      window.removeEventListener('scroll', onScroll, {
        capture: true,
      } as EventListenerOptions);
    });
  });
}
