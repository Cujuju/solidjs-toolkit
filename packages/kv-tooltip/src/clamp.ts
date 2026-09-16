import { createSignal } from 'solid-js';

/** `document.compatMode` with no doctype; CSSOM View then measures the viewport on `body`. */
const QUIRKS_COMPAT_MODE = 'BackCompat';

/** Viewport size — shared signal across all tooltip instances. */
const [vpSize, setVpSize] = createSignal(
  typeof document !== 'undefined' ? readViewportSize() : { vw: 1920, vh: 1080 },
  { equals: (a, b) => a.vw === b.vw && a.vh === b.vh },
);

/**
 * Fixed-panel viewport. `client*` excludes classic scrollbars; `window.inner*` is the fallback
 * where the measured root has no layout box and reports 0 (jsdom).
 */
function readViewportSize(): { vw: number; vh: number } {
  const root: Element | null =
    document.compatMode === QUIRKS_COMPAT_MODE ? document.body : document.documentElement;
  return {
    vw: root?.clientWidth || window.innerWidth,
    vh: root?.clientHeight || window.innerHeight,
  };
}

/** Public read-only accessor for the viewport size (see `readViewportSize`). */
export const viewportSize = vpSize;

/**
 * Bumped on every scroll; read only to subscribe, since a fixed panel's captured point or rect
 * goes stale on scroll.
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
    setVpSize(readViewportSize());
  });
  // Capture phase REQUIRED: `scroll` doesn't bubble out of nested scrollers, which is exactly
  // what strands a fixed panel.
  window.addEventListener('scroll', () => setScrollTick((n) => n + 1), {
    capture: true,
    passive: true,
  });
}

/**
 * `cursor`: below-right of the pointer, hysteresis flips, ignores `anchor`. `above-*`/`below-*`:
 * that side of `anchor`; `-start`/`-end` align left/right edges.
 */
export type KvTooltipPlacement =
  | 'cursor'
  | 'above-start'
  | 'below-start'
  | 'above-end'
  | 'below-end';

/**
 * Equals `DEFAULT_POPOVER_OFFSET_PX` in `@cujuju/solidjs-anchored-popover`, so a tooltip and
 * menu on one trigger share an offset grid. Change only with that constant.
 */
export const DEFAULT_ANCHOR_GAP_PX = 4;

/**
 * Used when `anchor` is set but `placement` stays `'cursor'`; matches anchored-popover's
 * default direction.
 */
export const DEFAULT_ANCHORED_PLACEMENT: KvTooltipPlacement = 'below-start';

/** Structural `DOMRect` subset so tests can pass plain literals. */
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
 * Place against a rect; invariant: never overlap the anchor. Vertical overflow flips sides,
 * else stays flush on the roomier side, overflowing the viewport. Horizontal falls back to a
 * clamp. Pure.
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
   * Returning a rect selects anchored mode (`getX`/`getY` and hysteresis ignored); `null`
   * falls back to cursor mode, so an unmounted anchor degrades.
   */
  getAnchorRect?: () => AnchorRectLike | null;
  getPlacement?: () => KvTooltipPlacement;
  getAnchorGapPx?: () => number;
}

/**
 * Clamped reactive position. Cursor mode flips around the point with hysteresis; anchored mode
 * uses `placeAgainstRect` without hysteresis (a static rect can't strobe). Tracks resize and scroll.
 */
export function createClampedPosition(
  opts: ClampedPositionOptions,
): () => { x: number; y: number } {
  ensureViewportListeners();
  // Per show: a scrollbar can appear with no resize event. Residual — one that
  // toggles mid-show is not seen until the next show.
  if (typeof document !== 'undefined') setVpSize(readViewportSize());
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
