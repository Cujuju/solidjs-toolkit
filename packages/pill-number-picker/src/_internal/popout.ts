/**
 * Pop-out placement — pure geometry, no DOM. The panel is portalled and positioned in VIEWPORT
 * coordinates so it escapes any clipping ancestor.
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

/**
 * Where to put the panel. PREFERS ABOVE: a panel below would cover the rows after the anchor,
 * which is what the user is most likely to click next.
 */
export function resolvePopoutPosition(
  anchor: PopoutRect,
  panel: { width: number; height: number },
  viewport: PopoutViewport,
  gap: number = POPOUT_DEFAULT_GAP_PX,
): PopoutPosition {
  const spaceAbove = anchor.top - gap - POPOUT_VIEWPORT_MARGIN_PX;
  const spaceBelow =
    viewport.height - (anchor.top + anchor.height) - gap - POPOUT_VIEWPORT_MARGIN_PX;

  let placement: PopoutPlacement;
  if (panel.height <= spaceAbove) placement = 'top';
  else if (panel.height <= spaceBelow) placement = 'bottom';
  else placement = spaceAbove >= spaceBelow ? 'top' : 'bottom';

  const rawTop =
    placement === 'top'
      ? anchor.top - panel.height - gap
      : anchor.top + anchor.height + gap;

  // Clamp vertically so a panel taller than the space it was given still has its
  // top edge on-screen (see above — losing the bottom is survivable, losing the
  // top is not).
  const maxTop = Math.max(
    POPOUT_VIEWPORT_MARGIN_PX,
    viewport.height - panel.height - POPOUT_VIEWPORT_MARGIN_PX,
  );
  const top = Math.min(Math.max(rawTop, POPOUT_VIEWPORT_MARGIN_PX), maxTop);

  // Left-align to the anchor, then clamp into the viewport: a panel is wider than its
    // anchor, so one near the right edge would otherwise run off-screen.
  const maxLeft = Math.max(
    POPOUT_VIEWPORT_MARGIN_PX,
    viewport.width - panel.width - POPOUT_VIEWPORT_MARGIN_PX,
  );
  const left = Math.min(Math.max(anchor.left, POPOUT_VIEWPORT_MARGIN_PX), maxLeft);

  return { top, left, placement };
}
