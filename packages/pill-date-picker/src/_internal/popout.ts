/**
 * Pop-out placement — pure geometry, no DOM.
 *
 * The expanded ladder must ESCAPE its ancestors: the pill lives in a dense row (an order
 * ticket, a chain header, a rail) that is very often inside something with
 * `overflow: hidden` or `overflow-y: auto`, and an in-flow expansion is clipped dead by
 * that ancestor. The panel is therefore rendered through a Portal and positioned in
 * VIEWPORT coordinates (`position: fixed`) — which is why this math takes a viewport and
 * not a containing block.
 *
 * ── Why this is not `@cujuju/solidjs-anchored-popover` ──────────────────────────────────
 * That package is the obvious candidate and it does NOT fit, for two reasons that both
 * matter here:
 *   1. It repositions on `resize` only. There is no scroll listener at all, let alone a
 *      CAPTURING one — so the instant the pill's scroll container (not `window`) scrolls,
 *      its fixed-positioned panel detaches from the anchor and floats. The primary hostile
 *      ancestor for this control is exactly an `overflow-y: auto` box.
 *   2. It clamps into the viewport but never FLIPS. A 10-row expiration ladder opened near
 *      the bottom of the screen would be shoved up over its own anchor rather than opening
 *      upward from it.
 * (It also drives the HTML Popover API, which jsdom does not implement — its own suite has
 * to monkey-patch `HTMLElement.prototype` to test anything. That would make this package's
 * DOM tests assertions about a stub.)
 *
 * ── Why this is a near-copy of pill-number-picker's `_internal/popout.ts` ───────────────
 * It is the same problem and deliberately the same solution. The geometry is DUPLICATED
 * rather than shared because the only correct de-duplication — hoisting it into a package
 * both depend on — cannot be done from inside this package alone. That extraction is the
 * real fix and is flagged, not hidden. The one intentional divergence is the default
 * preferred side (see `resolvePopoutPosition`).
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
 * Where to put the panel, given where the anchor is.
 *
 * PREFERS BELOW — the opposite of the sibling number-picker's pop-out, and the difference is
 * not an oversight. That panel is a +/- stepper the width of its own anchor, and opening it
 * downward would cover the NEXT row (the leg the user is most likely to touch next). This
 * panel is a list the user is about to READ and pick from; a downward-opening list is the
 * universal convention for a select, and reading it top-down from under its trigger is what
 * every user already expects. Overriding `prefer` restores the other behaviour for a caller
 * whose pill genuinely sits at the bottom of a fixed pane.
 *
 * Flips to the other side only when the preferred one genuinely lacks room, and if NEITHER
 * fits, takes the side with more room and clamps — a panel with its top edge off-screen is
 * unusable, whereas a clipped bottom edge still shows the first (nearest-dated) rows, which
 * are the ones a trader wants.
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

  // Left-align to the anchor, then clamp into the viewport. The panel is wider than its
  // anchor (each row carries a DTE the collapsed pill was hiding), so an anchor near the
  // right edge would otherwise push the panel off-screen.
  const maxLeft = Math.max(
    POPOUT_VIEWPORT_MARGIN_PX,
    viewport.width - panel.width - POPOUT_VIEWPORT_MARGIN_PX,
  );
  const left = Math.min(Math.max(anchor.left, POPOUT_VIEWPORT_MARGIN_PX), maxLeft);

  return { top, left, placement };
}
