import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { scrollerOf } from './scroller';

/** Layout rounds to sub-pixels; within this the content already ends where it should. */
const SETTLE_TOLERANCE_PX = 1;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Space a pushing drag leaves when it shrinks the workspace. Shrinking the box at release would clamp the scroll and
 * jump everything under the pointer, so the box keeps the drag's tallest height; on release the scroller glides up
 * until the content ends at its usual margin, and the space goes as it scrolls out of view.
 */
export function createTrailingSpace(options: { container: () => HTMLElement | undefined; heightPx: () => number | undefined }) {
  const [trail, setTrail] = createSignal<number | undefined>(undefined);

  /** How far down the workspace the scroller shows, and the most it should show: the layout plus what sits below the box. */
  const measure = () => {
    const el = options.container();
    const height = options.heightPx();
    if (!el || height === undefined) return null;
    const scroller = scrollerOf(el);
    const { top, bottom } = scroller.bounds();
    const box = el.getBoundingClientRect();
    const below = scroller.el.scrollHeight - (box.bottom - top + scroller.el.scrollTop);
    return { scroller, visible: bottom - box.top, end: height + below };
  };
  /** Drops the space the scroller no longer shows; all of it once the content's real end is in view. */
  const trim = () => {
    const held = trail();
    const view = measure();
    if (held === undefined) return;
    if (!view || view.visible <= view.end + SETTLE_TOLERANCE_PX) return setTrail(undefined);
    setTrail(Math.min(held, view.visible));
  };
  /** Scrolls up just enough that the content ends at the bottom of the scroller; the scroll events trim as it goes. */
  const settle = () => {
    const view = measure();
    if (!view || view.visible <= view.end + SETTLE_TOLERANCE_PX) return setTrail(undefined);
    const behavior = window.matchMedia?.(REDUCED_MOTION).matches ? 'auto' : 'smooth';
    view.scroller.el.scrollBy({ top: view.end - view.visible, behavior });
  };

  const trailing = createMemo(() => trail() !== undefined);
  createEffect(() => {
    if (!trailing()) return;
    window.addEventListener('scroll', trim, true);
    onCleanup(() => window.removeEventListener('scroll', trim, true));
  });

  return {
    trail,
    /** A pushing drag ended with its box at `holdPx`: keep that height, then settle once the new layout is drawn. */
    hold(holdPx: number) {
      setTrail(Math.max(trail() ?? 0, holdPx));
      requestAnimationFrame(settle);
    },
  };
}
