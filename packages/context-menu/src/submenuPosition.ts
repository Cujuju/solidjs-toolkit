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

/** Pixels a submenu's leading edge tucks UNDER its parent menu's edge.
 *
 *  Both parent and submenu live in the browser's top layer
 *  (`popover='manual'`); top-layer order is LIFO of `showPopover()`
 *  calls, and the component re-promotes the parent after a submenu
 *  opens so the parent paints above it — the overlap then reads as the
 *  submenu sliding out from under the parent. Tuned visually against
 *  the parent's OUTER rect so the on-screen overlap matches the literal
 *  value; bump only with a fresh visual pass (1px changes are
 *  perceptible). */
export const POPOVER_PARENT_UNDER_OVERLAP_PX = 3;

export interface SubmenuStyleInput {
  /** The submenu trigger row's bounding rect. */
  triggerRect: { top: number };
  /** The parent menu's OUTER bounding rect — the overlap anchors here
   *  so it lands at its literal pixel value (anchoring on the trigger
   *  row would silently add the parent's padding + border). When the
   *  parent ref is not yet wired, pass the trigger rect. */
  parentRect: { left: number; right: number };
  /** The submenu flyout's own measured size. */
  flyoutRect: { width: number; height: number };
  viewportW: number;
  viewportH: number;
  /** Scrollable submenus cap their height — see {@link SCROLLABLE_SUBMENU_MAX_VH}. */
  scrollable: boolean;
}

/**
 * Compute the inline style for a Portal'd submenu flyout.
 *
 * Horizontal: prefer the right of the parent; flip left when the right
 * has no room; when neither side fits, pick the side with more space
 * and let the final clamp pull the box on-screen. The opening edge is
 * shifted by {@link POPOVER_PARENT_UNDER_OVERLAP_PX} for the tuck-under.
 *
 * Vertical: align the top with the trigger, shift up if it overflows
 * the bottom.
 *
 * The returned style neutralizes the UA `[popover]` defaults:
 * `margin: 0` cancels `margin: auto`; `right/bottom: auto` cancel the
 * `inset: 0` shorthand so they don't pin and squash the box.
 * `width: max-content` sizes the panel to its longest child. z-index
 * is omitted — the top layer ignores it.
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
    // `max-height` caps the GlassMenu root; its scrollable body owns
    // the `overflow-y: auto`, so no overflow rule belongs here.
    'max-height': `${maxH}px`,
  };
}
