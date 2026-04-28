/**
 * Apply an optional easing curve to a normalized progress value.
 *
 * The function is a pure transform from `t in [0, 1]` to a target value
 * also in `[0, 1]`. Output is clamped — even if the easing function returns
 * an out-of-range value (overshoot, undershoot), geometry calculations
 * downstream see only valid progress.
 *
 * Returns `raw` unchanged when no easing is supplied. This keeps the
 * default behavior identical to the pre-easing implementation.
 *
 * Common easings consumers might pass:
 *   t => t * t                                         // ease-in (accelerating)
 *   t => 1 - Math.pow(1 - t, 3)                        // ease-out (decelerating)
 *   t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2 // ease-in-out
 */
export function applyEasing(raw: number, easing?: (t: number) => number): number {
  if (!easing) return raw;
  const eased = easing(raw);
  return Math.max(0, Math.min(1, eased));
}
