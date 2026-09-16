/**
 * Layout border-box size, unscaled by CSS transforms. Use it for SIZING children;
 * `getBoundingClientRect` is post-transform, so feeding it to a child that inherits the
 * transform double-applies it.
 */
export function measureLayoutBox(el: HTMLElement): { w: number; h: number } {
  return { w: el.offsetWidth, h: el.offsetHeight };
}
