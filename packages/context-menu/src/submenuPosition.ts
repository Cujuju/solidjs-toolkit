/**
 * Submenu-flyout positioning math — a pure function, no DOM access, so
 * it is independently unit-testable. The component layer reads the
 * rects + viewport and feeds them in.
 */

/** Viewport edge margin kept clear by every clamp (px). */
export const VIEWPORT_MARGIN_PX = 4;

/** A scrollable submenu caps its height at this fraction of the
 *  viewport so a long list scrolls instead of running off-screen. */
export const SCROLLABLE_SUBMENU_MAX_VH = 0.6;

/** Pixels a submenu's leading edge tucks UNDER its parent's edge. Anchored on the parent's
 *  OUTER rect, not the trigger row; 1px changes are perceptible, so re-tune visually. */
export const POPOVER_PARENT_UNDER_OVERLAP_PX = 3;

export interface SubmenuStyleInput {
  /** The submenu trigger row's bounding rect. */
  triggerRect: { top: number };
  /** The parent menu's OUTER rect (the trigger row would add padding and border); pass the
   *  trigger rect until the parent ref wires. */
  parentRect: { left: number; right: number };
  /** The submenu flyout's own measured size. */
  flyoutRect: { width: number; height: number };
  viewportW: number;
  viewportH: number;
  /** Scrollable submenus cap their height — see {@link SCROLLABLE_SUBMENU_MAX_VH}. */
  scrollable: boolean;
}

/**
 * Inline style for a Portal'd submenu flyout: prefers the parent's right, flips left or picks
 * the roomier side, then clamps. Top aligns to the trigger, shifting up on overflow.
 */
export function computeSubmenuStyle(
  input: SubmenuStyleInput,
): Record<string, string> {
  const { triggerRect, parentRect, flyoutRect, viewportW, viewportH, scrollable } =
    input;
  const margin = VIEWPORT_MARGIN_PX;

  const fitsRight = parentRect.right + flyoutRect.width <= viewportW - margin;
  const fitsLeft = parentRect.left - flyoutRect.width >= margin;
  let left: number;
  if (fitsRight) {
    left = parentRect.right - POPOVER_PARENT_UNDER_OVERLAP_PX;
  } else if (fitsLeft) {
    left = parentRect.left - flyoutRect.width + POPOVER_PARENT_UNDER_OVERLAP_PX;
  } else {
    // Neither side fits — pick whichever has more free space; the
    // clamp below pulls the flyout fully into view.
    const rightRoom = viewportW - parentRect.right;
    const leftRoom = parentRect.left;
    left =
      rightRoom >= leftRoom
        ? parentRect.right - POPOVER_PARENT_UNDER_OVERLAP_PX
        : parentRect.left - flyoutRect.width + POPOVER_PARENT_UNDER_OVERLAP_PX;
  }
  // Horizontal clamp — safety net for a flyout wider than either side.
  left = Math.max(margin, Math.min(left, viewportW - flyoutRect.width - margin));

  const top = Math.max(
    margin,
    Math.min(triggerRect.top - margin, viewportH - flyoutRect.height - margin),
  );

  const maxH = scrollable
    ? Math.min(viewportH * SCROLLABLE_SUBMENU_MAX_VH, viewportH - margin * 2)
    : viewportH - margin * 2;

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    right: 'auto',
    bottom: 'auto',
    margin: '0',
    width: 'max-content',
    'max-width': `calc(100vw - ${margin * 2}px)`,
    // `max-height` caps the flyout root; GlassMenu's body or the solid
    // card itself owns the `overflow-y: auto`, so no overflow rule belongs here.
    'max-height': `${maxH}px`,
  };
}
