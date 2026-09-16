/**
 * Clamped easing transform `t => t'` in `[0, 1]`, so overshoot or undershoot can't break
 * downstream geometry. Returns `raw` when no easing is given.
 */
export function applyEasing(raw: number, easing?: (t: number) => number): number {
  if (!easing) return raw;
  const eased = easing(raw);
  return Math.max(0, Math.min(1, eased));
}
