/**
 * Pure helper computing the dot's horizontal offset from the pill's left edge.
 *
 * Three positions, deterministic:
 *   indeterminate  → centered:   (width - dotSize) / 2
 *   enabled=true   → right edge: width - dotSize - inset
 *   enabled=false  → left edge:  inset
 *
 * The track is a stadium (border-radius = height / 2), so the tangent inset is
 * (height - dotSize) / 2 on BOTH axes — callers pass the same centerOffset()
 * they use for `top`. For the default dot that is exactly DOT_INSET_PX.
 *
 * Indeterminate takes precedence over enabled because it represents
 * "explicitly mixed state" — enabled is the prediction of what the next
 * commit would set, not the current visual.
 *
 * Numbers are px. Strings are CSS lengths (e.g. '100%', '1.5rem'); any string
 * input yields a `calc()` expression. Returns a CSS length string.
 *
 * The result is consumed as `translateX()`, where a percentage resolves against
 * the DOT's own width: '100%' therefore denotes the dot itself (how the caller
 * names the stylesheet-sized default dot), and pill dimensions must be real
 * lengths.
 */
export const DOT_INSET_PX = 2;

export function dotTranslate(
  enabled: boolean,
  indeterminate: boolean,
  width: number | string,
  dotSize: number | string,
  inset: number | string,
): string {
  if (indeterminate) return centerOffset(width, dotSize);
  if (!enabled) return cssLength(inset);
  if (typeof width === 'number' && typeof dotSize === 'number' && typeof inset === 'number') {
    return `${width - dotSize - inset}px`;
  }
  return `calc(${cssLength(width)} - ${cssLength(dotSize)} - ${cssLength(inset)})`;
}

/** Offset that centers a dot of `dotSize` within `extent` (same units rules as dotTranslate). */
export function centerOffset(extent: number | string, dotSize: number | string): string {
  if (typeof extent === 'number' && typeof dotSize === 'number') return `${(extent - dotSize) / 2}px`;
  return `calc((${cssLength(extent)} - ${cssLength(dotSize)}) / 2)`;
}

function cssLength(v: number | string): string {
  return typeof v === 'number' ? `${v}px` : v;
}
