/**
 * Pure geometry helper for HoldIndicator. Computes the signed per-side
 * distance from parent's border-OUTER edge to stroke's OUTER edge,
 * given a named placement and an additional inset shift.
 *
 * Positive = outward (stroke outer beyond border-outer).
 * Negative = inward (stroke outer inside border-outer).
 *
 * Extracted as a pure function so it can be unit-tested independently
 * of the rendering component.
 */

export type StrokePlacement = 'outside' | 'center' | 'on-border' | 'inside';

export interface BorderOffsets {
  t: number;
  r: number;
  b: number;
  l: number;
}

export interface StrokeOuterOffset {
  t: number;
  r: number;
  b: number;
  l: number;
}

export function strokeOuterOffset(
  mode: StrokePlacement,
  strokeWidth: number,
  borderOffsets: BorderOffsets,
  strokeInset: number,
): StrokeOuterOffset {
  let base: StrokeOuterOffset;
  if (mode === 'outside') {
    base = { t: strokeWidth, r: strokeWidth, b: strokeWidth, l: strokeWidth };
  } else if (mode === 'center') {
    base = {
      t: strokeWidth / 2,
      r: strokeWidth / 2,
      b: strokeWidth / 2,
      l: strokeWidth / 2,
    };
  } else if (mode === 'on-border') {
    base = { t: 0, r: 0, b: 0, l: 0 };
  } else {
    // 'inside' — stroke outer at border INNER edge (padding-edge)
    base = { t: -borderOffsets.t, r: -borderOffsets.r, b: -borderOffsets.b, l: -borderOffsets.l };
  }
  // `+ 0` normalises -0 → +0 so consumers and tests don't hit the JS
  // signed-zero distinction (e.g., `Object.is(-0, 0)` is false).
  return {
    t: base.t - strokeInset + 0,
    r: base.r - strokeInset + 0,
    b: base.b - strokeInset + 0,
    l: base.l - strokeInset + 0,
  };
}
