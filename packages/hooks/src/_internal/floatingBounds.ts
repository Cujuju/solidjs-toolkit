/**
 * Host-reserved viewport edges (a custom title bar, a dock) that floating layers must never cover.
 * The host sets these on `:root` in px; unset means no reservation.
 */
export const FLOATING_INSET_VARS = {
  top: '--cujuju-floating-inset-top',
  right: '--cujuju-floating-inset-right',
  bottom: '--cujuju-floating-inset-bottom',
  left: '--cujuju-floating-inset-left',
} as const;

/** The viewport-space rect a floating layer may occupy. */
export interface FloatingBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

function insetPx(style: CSSStyleDeclaration, name: string): number {
  const px = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(px) && px > 0 ? px : 0;
}

/**
 * The viewport minus host-reserved insets. Every floating clamp reads this, never `window.inner*`.
 * `viewport` overrides the window size, e.g. the scrollbar-excluding layout viewport.
 */
export function floatingBounds(viewport?: { width: number; height: number }): FloatingBounds {
  if (typeof window === 'undefined') {
    const { width = 0, height = 0 } = viewport ?? {};
    return { top: 0, right: width, bottom: height, left: 0, width, height };
  }
  const style = getComputedStyle(document.documentElement);
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const top = insetPx(style, FLOATING_INSET_VARS.top);
  const left = insetPx(style, FLOATING_INSET_VARS.left);
  const right = Math.max(left, width - insetPx(style, FLOATING_INSET_VARS.right));
  const bottom = Math.max(top, height - insetPx(style, FLOATING_INSET_VARS.bottom));
  return { top, right, bottom, left, width: right - left, height: bottom - top };
}
