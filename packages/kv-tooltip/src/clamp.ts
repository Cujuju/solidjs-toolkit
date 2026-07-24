import { createSignal } from 'solid-js';

/** Viewport size — shared signal across all tooltip instances. */
const [vpSize, setVpSize] = createSignal({
  vw: typeof window !== 'undefined' ? window.innerWidth : 1920,
  vh: typeof window !== 'undefined' ? window.innerHeight : 1080,
});

/**
 * Monotonic counter bumped on every viewport scroll. Position accessors read
 * it purely to subscribe: a `position: fixed` panel placed at a captured point
 * (or against a captured anchor rect) goes stale the moment anything under it
 * scrolls, so every consumer of a clamped position must recompute on scroll.
 * The value itself is meaningless — only the change matters.
 */
const [scrollTick, setScrollTick] = createSignal(0);

/** Public read-only accessor for the scroll counter (see `scrollTick`). */
export const viewportScrollTick = scrollTick;

// One resize + one scroll listener for the whole app, installed lazily.
let viewportListenersAttached = false;
export function ensureViewportListeners(): void {
  if (viewportListenersAttached || typeof window === 'undefined') return;
  viewportListenersAttached = true;
  window.addEventListener('resize', () => {
    setVpSize({ vw: window.innerWidth, vh: window.innerHeight });
  });
  // Capture phase is REQUIRED: `scroll` does not bubble out of a nested scroll
  // container, so a bubble-phase window listener sees only document scrolls. A
  // capture-phase window listener sees every scroll in the tree — which is
  // exactly the case that strands a fixed-position panel (a list scrolling
  // underneath a tooltip anchored to one of its rows).
  window.addEventListener('scroll', () => setScrollTick((n) => n + 1), {
    capture: true,
    passive: true,
  });
}

/**
 * Where the panel sits relative to its reference.
 *
 * - `cursor` — legacy behaviour: below-right of the pointer, flipping on
 *   overflow with hysteresis. Ignores `anchor`.
 * - `above-*` / `below-*` — anchored: the panel is placed on that side of the
 *   `anchor` rect. `-start` aligns the panel's left edge with the rect's left
 *   edge; `-end` aligns its right edge with the rect's right edge.
 */
export type KvTooltipPlacement =
  | 'cursor'
  | 'above-start'
  | 'below-start'
  | 'above-end'
  | 'below-end';

/**
 * Gap in px between the anchor rect's edge and the panel's facing edge.
 *
 * 4 is not an arbitrary aesthetic pick: it is the value of
 * `DEFAULT_POPOVER_OFFSET_PX` in `@cujuju/solidjs-anchored-popover`. A tooltip
 * and a popover anchored to the SAME trigger — the case anchored mode exists
 * for, tooltip above the field and menu below it — then sit on the same offset
 * grid, so the two surfaces read as one system instead of two near-misses.
 * Change this only if that constant changes.
 */
export const DEFAULT_ANCHOR_GAP_PX = 4;

/**
 * Placement used when an `anchor` is supplied but `placement` is left at its
 * `'cursor'` default. Below-start matches the anchored-popover's own default
 * direction, so an unconfigured anchored tooltip lands where a menu would.
 */
export const DEFAULT_ANCHORED_PLACEMENT: KvTooltipPlacement = 'below-start';

/**
 * Structural subset of `DOMRect` that placement actually needs. Declared
 * separately so tests can hand in plain object literals — constructing real
 * DOMRects in jsdom is possible but noisy, and nothing here reads `width`,
 * `height`, `x`, `y`, or the `toJSON` member.
 */
export interface AnchorRectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface RectPlacementInput {
  rect: AnchorRectLike;
  /** Measured panel width / height in px. */
  w: number;
  h: number;
  /** Viewport width / height in px. */
  vw: number;
  vh: number;
  placement: KvTooltipPlacement;
  anchorGapPx: number;
  edgePadPx: number;
}

/**
 * Place a panel against an anchor rect, flipping to the OPPOSITE SIDE OF THE
 * RECT on overflow.
 *
 * The invariant this function exists to hold: **the panel never overlaps its
 * own anchor.** The pre-0.2.0 clamp had no vertical flip on the top edge — it
 * hard-clamped (`if (y < edgePadPx) y = edgePadPx`), which in anchored mode
 * slides the panel straight down on top of the element it is describing.
 *
 * Degradation order when the requested side does not fit:
 *   1. flip to the opposite side of the rect, if the panel fits there;
 *   2. otherwise stay on whichever side has more room and remain FLUSH against
 *      the anchor, overflowing the viewport edge instead. Overlapping the
 *      anchor defeats the entire purpose of anchored placement, so viewport
 *      overflow is the lesser failure. Only a panel taller than both gaps
 *      around its anchor can reach this branch.
 *
 * Horizontally there is no such conflict — the panel is above or below the
 * rect, never beside it — so horizontal overflow falls back to a plain
 * viewport clamp after trying the opposite alignment.
 *
 * Pure: reads no signals, installs no listeners. Exported for contract tests.
 */
export function placeAgainstRect(input: RectPlacementInput): { x: number; y: number } {
  const { rect, w, h, vw, vh, placement, anchorGapPx, edgePadPx } = input;

  // ── Vertical: side of the rect, with a real flip ──────────────────────────
  const wantAbove = placement === 'above-start' || placement === 'above-end';
  const aboveY = rect.top - h - anchorGapPx;
  const belowY = rect.bottom + anchorGapPx;
  const aboveFits = aboveY >= edgePadPx;
  const belowFits = belowY + h <= vh - edgePadPx;

  let y: number | undefined = wantAbove
    ? aboveFits
      ? aboveY
      : belowFits
        ? belowY
        : undefined
    : belowFits
      ? belowY
      : aboveFits
        ? aboveY
        : undefined;
  if (y === undefined) {
    // Neither side fits: keep the side with more room, stay flush.
    const roomAbove = rect.top - anchorGapPx - edgePadPx;
    const roomBelow = vh - edgePadPx - rect.bottom - anchorGapPx;
    y = roomAbove > roomBelow ? aboveY : belowY;
  }

  // ── Horizontal: requested alignment, switching to the opposite on overflow ─
  const wantEnd = placement === 'above-end' || placement === 'below-end';
  const startX = rect.left;
  const endX = rect.right - w;
  const startFits = startX >= edgePadPx && startX + w <= vw - edgePadPx;
  const endFits = endX >= edgePadPx && endX + w <= vw - edgePadPx;

  let x: number | undefined = wantEnd
    ? endFits
      ? endX
      : startFits
        ? startX
        : undefined
    : startFits
      ? startX
      : endFits
        ? endX
        : undefined;
  if (x === undefined) {
    // Panel wider than the room either alignment leaves: plain viewport clamp.
    // Overlapping the anchor horizontally is harmless — the panel is already
    // above or below it, never beside it.
    x = Math.max(edgePadPx, Math.min(startX, vw - edgePadPx - w));
  }

  return { x, y };
}

export interface ClampedPositionOptions {
  /** Cursor X / Y in viewport coords. Consulted in cursor mode only. */
  getX: () => number;
  getY: () => number;
  /** Measured panel width / height in px. */
  getW: () => number;
  getH: () => number;
  hysteresisPx: number;
  edgePadPx: number;
  mouseOffsetX: number;
  mouseOffsetY: number;
  /**
   * Anchor rect accessor. Returning a rect switches the whole computation to
   * anchored mode: `getX`/`getY` are ignored and `hysteresisPx` is bypassed
   * (see below). Returning `null` falls back to cursor mode, so a consumer
   * whose anchor element unmounts degrades instead of freezing.
   */
  getAnchorRect?: () => AnchorRectLike | null;
  getPlacement?: () => KvTooltipPlacement;
  getAnchorGapPx?: () => number;
}

/**
 * Compute a clamped tooltip position — stays on-screen on all four edges.
 *
 * Two modes:
 *
 * **Cursor mode** (no anchor rect): default position is below-right of the
 * cursor, flipping to the opposite side of the POINT on right/bottom overflow.
 * Uses hysteresis to prevent flicker at flip boundaries: once flipped, requires
 * `hysteresisPx` of clearance before flipping back. Unchanged from 0.1.0.
 *
 * **Anchored mode** (anchor rect present): placement derives from the rect via
 * `placeAgainstRect` — see its doc for the flip contract.
 *
 * Hysteresis is deliberately BYPASSED in anchored mode. Hysteresis damps a
 * *moving* input: a cursor sitting exactly on the flip boundary would
 * otherwise strobe the panel between sides. A static anchor rect cannot
 * strobe — its flip state changes only on viewport resize or scroll, both
 * discrete user actions rather than tremor. Carrying the hysteresis latch
 * there would be state with no failure mode to prevent, and it would strand
 * the panel on the wrong side of the anchor after a resize.
 *
 * Accessors are called on each invocation; the returned accessor is the
 * reactive output. It subscribes to viewport resize AND scroll, so a
 * function-valued anchor re-reads its rect whenever the page moves.
 */
export function createClampedPosition(
  opts: ClampedPositionOptions,
): () => { x: number; y: number } {
  ensureViewportListeners();
  let flippedLeft = false;
  let flippedUp = false;

  return () => {
    const w = opts.getW();
    const h = opts.getH();
    const { vw, vh } = vpSize();
    // Subscribe only — see `scrollTick`. Read before the anchored early-return
    // so the subscription exists in both modes.
    void scrollTick();

    const rect = opts.getAnchorRect?.() ?? null;
    if (rect) {
      const requested = opts.getPlacement?.() ?? 'cursor';
      return placeAgainstRect({
        rect,
        w,
        h,
        vw,
        vh,
        placement: requested === 'cursor' ? DEFAULT_ANCHORED_PLACEMENT : requested,
        anchorGapPx: opts.getAnchorGapPx?.() ?? DEFAULT_ANCHOR_GAP_PX,
        edgePadPx: opts.edgePadPx,
      });
    }

    const mx = opts.getX();
    const my = opts.getY();
    const { hysteresisPx, edgePadPx, mouseOffsetX, mouseOffsetY } = opts;

    // Horizontal: default right of cursor, flip left with hysteresis
    let x = mx + mouseOffsetX;
    const wouldOverflowRight = x + w > vw - edgePadPx;
    if (flippedLeft) {
      if (!wouldOverflowRight && mx + mouseOffsetX + w < vw - edgePadPx - hysteresisPx) {
        flippedLeft = false;
        x = mx + mouseOffsetX;
      } else {
        x = mx - w - mouseOffsetX;
      }
    } else if (wouldOverflowRight) {
      flippedLeft = true;
      x = mx - w - mouseOffsetX;
    }
    if (x < edgePadPx) x = edgePadPx;

    // Vertical: default below cursor, flip above with hysteresis
    let y = my + mouseOffsetY;
    const wouldOverflowBottom = y + h > vh - edgePadPx;
    if (flippedUp) {
      if (!wouldOverflowBottom && my + mouseOffsetY + h < vh - edgePadPx - hysteresisPx) {
        flippedUp = false;
        y = my + mouseOffsetY;
      } else {
        y = my - h - (mouseOffsetY / 2);
      }
    } else if (wouldOverflowBottom) {
      flippedUp = true;
      y = my - h - (mouseOffsetY / 2);
    }
    if (y < edgePadPx) y = edgePadPx;

    return { x, y };
  };
}
