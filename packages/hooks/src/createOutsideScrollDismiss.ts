import { createEffect, onCleanup } from 'solid-js';

/**
 * Dismiss on scroll outside the panel (anchors desync). `shouldSuppress` exempts portalled
 * descendants. Capture phase catches non-window scrollers; gated on `getOpen()`.
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
      // Panel ref not committed yet: a pre-mount scroll (touchpad fling) must not dismiss the
      // just-opened panel.
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
