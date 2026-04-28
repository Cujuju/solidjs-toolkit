/**
 * Pure helper computing the dot's translateX offset from the pill's left edge.
 *
 * Three positions, deterministic:
 *   indeterminate  → centered:   (width - dotSize) / 2
 *   enabled=true   → right edge: width - dotSize - 2
 *   enabled=false  → left edge:  2
 *
 * The 2px lateral padding on the off/on positions matches `.ctp-dot { top: 2px }`
 * in styles.css — visual symmetry between the dot's vertical inset (set in CSS)
 * and its horizontal stop positions (computed here).
 *
 * Indeterminate takes precedence over enabled because it represents
 * "explicitly mixed state" — enabled is the prediction of what the next
 * commit would set, not the current visual.
 *
 * Returns a CSS length string ready for `transform: translateX(...)`.
 */
export function dotTranslate(
  enabled: boolean,
  indeterminate: boolean,
  width: number,
  dotSize: number,
): string {
  if (indeterminate) return `${(width - dotSize) / 2}px`;
  if (!enabled) return '2px';
  return `${width - dotSize - 2}px`;
}
