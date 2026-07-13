/**
 * Pop-out placement — pure geometry, no DOM.
 *
 * The collapsed picker expands into a panel that must ESCAPE its ancestors: a
 * consumer's row is very often inside something with `overflow: hidden` or
 * `overflow-y: auto`, which clips an absolutely-positioned child dead. The panel
 * is therefore rendered through a Portal and positioned in VIEWPORT coordinates
 * (`position: fixed`), which is why this math takes a viewport and not a
 * containing block.
 *
 * Kept separate from the component because it is the only part of the pop-out
 * with a right and a wrong answer, and it can be tested without a DOM.
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
 * Where to put the panel, given where the anchor is.
 *
 * PREFERS ABOVE. That is deliberate and not symmetric: the anchor is a value the
 * user just clicked, and a panel below it would cover the rows *after* it — in a
 * list of legs that is the next leg, i.e. the thing they are most likely to click
 * next. Opening upward covers rows they have already dealt with.
 *
 * Flips below only when there is genuinely not enough room above, and if NEITHER
 * side fits, takes the side with more room and clamps — a panel with its top edge
 * off-screen is unusable, whereas a clipped bottom edge still shows the controls.
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

  // Left-align to the anchor, then clamp into the viewport. A panel is wider than
  // its anchor (it carries the +/- the anchor was hiding), so an anchor near the
  // right edge would otherwise push the panel off-screen.
  const maxLeft = Math.max(
    POPOUT_VIEWPORT_MARGIN_PX,
    viewport.width - panel.width - POPOUT_VIEWPORT_MARGIN_PX,
  );
  const left = Math.min(Math.max(anchor.left, POPOUT_VIEWPORT_MARGIN_PX), maxLeft);

  return { top, left, placement };
}
