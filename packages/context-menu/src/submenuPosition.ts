import type { FloatingBounds } from '@cujuju/solidjs-hooks';

/**
 * Submenu-flyout positioning math — a pure function, no DOM access, so
 * it is independently unit-testable. The component layer reads the
 * rects + floating bounds and feeds them in.
 */

/** Edge margin kept clear inside the floating bounds by every clamp (px). */
export const VIEWPORT_MARGIN_PX = 4;

/** A scrollable submenu caps its height at this fraction of the
 *  floating bounds so a long list scrolls instead of running off-screen. */
export const SCROLLABLE_SUBMENU_MAX_VH = 0.6;

export interface SubmenuStyleInput {
  /** The submenu trigger row's bounding rect. */
  triggerRect: { top: number };
  /** The parent menu's OUTER rect; the flyout sits flush against it, zero gap and zero
   *  overlap (the trigger row would add padding and border). Pass the
   *  trigger rect until the parent ref wires. */
  parentRect: { left: number; right: number };
  /** The submenu flyout's own measured size. */
  flyoutRect: { width: number; height: number };
  /** Where floating layers may sit: `floatingBounds()`, the window minus host-reserved edges. */
  bounds: FloatingBounds;
  /** Scrollable submenus cap their height — see {@link SCROLLABLE_SUBMENU_MAX_VH}. */
  scrollable: boolean;
}

/**
 * Inline style for a Portal'd submenu flyout, flush beside its parent: prefers the right, flips left or picks
 * the roomier side, then clamps. Top aligns to the trigger, shifting up on overflow.
 */
export function computeSubmenuStyle(
  input: SubmenuStyleInput,
): Record<string, string> {
  const { triggerRect, parentRect, flyoutRect, bounds, scrollable } = input;
  const margin = VIEWPORT_MARGIN_PX;

  const fitsRight = parentRect.right + flyoutRect.width <= bounds.right - margin;
  const fitsLeft = parentRect.left - flyoutRect.width >= bounds.left + margin;
  let left: number;
  if (fitsRight) {
    left = parentRect.right;
  } else if (fitsLeft) {
    left = parentRect.left - flyoutRect.width;
  } else {
    // Neither side fits — pick whichever has more free space; the
    // clamp below pulls the flyout fully into view.
    const rightRoom = bounds.right - parentRect.right;
    const leftRoom = parentRect.left - bounds.left;
    left =
      rightRoom >= leftRoom
        ? parentRect.right
        : parentRect.left - flyoutRect.width;
  }
  // Horizontal clamp — safety net for a flyout wider than either side.
  left = Math.max(bounds.left + margin, Math.min(left, bounds.right - flyoutRect.width - margin));

  // The lower bound wins: a flyout taller than the bounds starts at the top edge and scrolls.
  const top = Math.max(
    bounds.top + margin,
    Math.min(triggerRect.top - margin, bounds.bottom - flyoutRect.height - margin),
  );

  const fullH = Math.max(0, bounds.height - margin * 2);
  const maxH = scrollable ? Math.min(bounds.height * SCROLLABLE_SUBMENU_MAX_VH, fullH) : fullH;

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    right: 'auto',
    bottom: 'auto',
    margin: '0',
    width: 'max-content',
    'max-width': `${Math.max(0, bounds.width - margin * 2)}px`,
    // `max-height` caps the flyout root; GlassMenu's body or the solid
    // card itself owns the `overflow-y: auto`, so no overflow rule belongs here.
    'max-height': `${maxH}px`,
  };
}
