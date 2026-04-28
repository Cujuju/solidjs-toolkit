import { createSignal } from 'solid-js';

/** Viewport size — shared signal across all tooltip instances. */
const [vpSize, setVpSize] = createSignal({
  vw: typeof window !== 'undefined' ? window.innerWidth : 1920,
  vh: typeof window !== 'undefined' ? window.innerHeight : 1080,
});

// One resize listener for the whole app, installed lazily.
let resizeListenerAttached = false;
function ensureResizeListener(): void {
  if (resizeListenerAttached || typeof window === 'undefined') return;
  resizeListenerAttached = true;
  window.addEventListener('resize', () => {
    setVpSize({ vw: window.innerWidth, vh: window.innerHeight });
  });
}

/**
 * Compute clamped tooltip position — stays on-screen on all four edges.
 * Uses hysteresis to prevent flicker at flip boundaries: once flipped to
 * the opposite side, requires `hysteresisPx` of clearance before flipping
 * back.
 *
 * Accessors are called on each invocation; the returned accessor is the
 * reactive output.
 */
export function createClampedPosition(
  getX: () => number,
  getY: () => number,
  getW: () => number,
  getH: () => number,
  hysteresisPx: number,
  edgePadPx: number,
  mouseOffsetX: number,
  mouseOffsetY: number,
): () => { x: number; y: number } {
  ensureResizeListener();
  let flippedLeft = false;
  let flippedUp = false;

  return () => {
    const mx = getX();
    const my = getY();
    const w = getW();
    const h = getH();
    const { vw, vh } = vpSize();

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
