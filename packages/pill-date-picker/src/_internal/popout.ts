/**
 * Pop-out placement — pure geometry. The ladder is Portalled and positioned in VIEWPORT
 * coordinates to escape clipping ancestors. Near-copy of pill-number-picker's: the shared
 * extraction is flagged, not hidden.
 */

export interface PopoutRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PopoutViewport {
  width: number;
  height: number;
}

export type PopoutPlacement = 'top' | 'bottom';

export interface PopoutPosition {
  top: number;
  left: number;
  placement: PopoutPlacement;
}

/** Keep the panel this far from the viewport edge, so it never sits flush against it. */
export const POPOUT_VIEWPORT_MARGIN_PX = 4;
/** Default gap between the anchor and the panel. */
export const POPOUT_DEFAULT_GAP_PX = 4;
/** Which side to open toward when BOTH sides have room. See `resolvePopoutPosition`. */
export const POPOUT_DEFAULT_PREFERENCE: PopoutPlacement = 'bottom';

/**
 * Where to put the panel. PREFERS BELOW — a list reads downward — unlike the sibling
 * number-picker's stepper. Flips when the preferred side lacks room; if neither fits, takes
 * the roomier.
 */
export function resolvePopoutPosition(
  anchor: PopoutRect,
  panel: { width: number; height: number },
  viewport: PopoutViewport,
  gap: number = POPOUT_DEFAULT_GAP_PX,
  prefer: PopoutPlacement = POPOUT_DEFAULT_PREFERENCE,
): PopoutPosition {
  const spaceAbove = anchor.top - gap - POPOUT_VIEWPORT_MARGIN_PX;
  const spaceBelow =
    viewport.height - (anchor.top + anchor.height) - gap - POPOUT_VIEWPORT_MARGIN_PX;

  const spaceOn = (side: PopoutPlacement): number => (side === 'top' ? spaceAbove : spaceBelow);
  const other: PopoutPlacement = prefer === 'top' ? 'bottom' : 'top';

  let placement: PopoutPlacement;
  if (panel.height <= spaceOn(prefer)) placement = prefer;
  else if (panel.height <= spaceOn(other)) placement = other;
  else placement = spaceAbove >= spaceBelow ? 'top' : 'bottom';

  const rawTop =
    placement === 'top'
      ? anchor.top - panel.height - gap
      : anchor.top + anchor.height + gap;

  // Clamp vertically so a panel taller than the space it was given still has its top edge
  // on-screen (see above — losing the bottom is survivable, losing the top is not).
  const maxTop = Math.max(
    POPOUT_VIEWPORT_MARGIN_PX,
    viewport.height - panel.height - POPOUT_VIEWPORT_MARGIN_PX,
  );
  const top = Math.min(Math.max(rawTop, POPOUT_VIEWPORT_MARGIN_PX), maxTop);

  // Left-align to the anchor, then clamp: the panel is wider than its anchor, so a pill near
  // the right edge would push it off-screen.
  const maxLeft = Math.max(
    POPOUT_VIEWPORT_MARGIN_PX,
    viewport.width - panel.width - POPOUT_VIEWPORT_MARGIN_PX,
  );
  const left = Math.min(Math.max(anchor.left, POPOUT_VIEWPORT_MARGIN_PX), maxLeft);

  return { top, left, placement };
}

/**
 * True once the anchor has left the viewport entirely — a panel clamped on-screen for it floats,
 * attached to nothing. Strict comparisons, so an unmeasured all-zero rect counts as visible.
 */
export function isAnchorOutsideViewport(anchor: PopoutRect, viewport: PopoutViewport): boolean {
  return (
    anchor.top + anchor.height < 0 ||
    anchor.top > viewport.height ||
    anchor.left + anchor.width < 0 ||
    anchor.left > viewport.width
  );
}
