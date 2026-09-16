/**
 * Dot offset from the pill's left edge: indeterminate centers (and wins over enabled), true goes
 * right, false left. Consumed as `translateX()`, where a percentage resolves against the DOT's
 * own width.
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
