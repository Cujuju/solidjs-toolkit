/**
 * Pure helpers for decimal/precision support in PillNumberPicker.
 *
 * Three concerns this module addresses:
 *
 *   1. Parsing user-entered text — `parseInt` truncates decimals; need
 *      `parseFloat` when decimal mode is on.
 *
 *   2. Step arithmetic floating-point drift — `0.1 + 0.2` is
 *      `0.30000000000000004`, not `0.3`. Rounding to precision after every
 *      step keeps the displayed/stored value clean.
 *
 *   3. Display formatting — `(1.5).toFixed(2) === '1.50'`, which is what
 *      the user wants when precision is 2 (e.g., dollar amounts always
 *      shown to two places). `String(1.5)` gives `'1.5'`, missing the
 *      trailing zero.
 *
 * All helpers are pure functions with no DOM / Solid dependencies, so they
 * unit-test without touching the rendering pipeline.
 */

/**
 * Number of decimal places in `n`'s string representation.
 *
 * Handles scientific notation: `1e-3` toString is `'0.001'` (3 decimals)
 * but `1e-7` toString is `'1e-7'` — without scientific handling we'd
 * report 0 decimals for very small numbers. Falls through to the dot-split
 * path for all simple decimal literals (most common case).
 *
 *   decimalsOf(0)     === 0
 *   decimalsOf(1)     === 0
 *   decimalsOf(0.5)   === 1
 *   decimalsOf(0.001) === 3
 *   decimalsOf(1e-7)  === 7
 *   decimalsOf(NaN)   === 0  (treated as integer; not actionable signal)
 */
export function decimalsOf(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0;
  const s = Math.abs(n).toString();
  // Scientific notation: 'X.YYYe-N' or 'Xe-N'.
  const eIdx = s.indexOf('e-');
  if (eIdx !== -1) {
    const exp = parseInt(s.slice(eIdx + 2), 10);
    const mantissaDecimals = s.slice(0, eIdx).split('.')[1]?.length ?? 0;
    return exp + mantissaDecimals;
  }
  return s.split('.')[1]?.length ?? 0;
}

/**
 * The precision (decimal places) the picker should use for parsing,
 * rounding, and display.
 *
 * Resolution order:
 *   1. Explicit `precisionProp` (consumer chose; honor it). Allows e.g.
 *      `step=1, precision=2` → integer steps but display as '5.00'.
 *   2. Else, infer from step's own decimals. `step=0.5` → 1.
 *   3. Else, 0 (integer mode).
 */
export function effectivePrecision(stepProp: number, precisionProp: number | undefined): number {
  if (precisionProp !== undefined) return Math.max(0, Math.floor(precisionProp));
  return decimalsOf(stepProp);
}

/**
 * Clamps `v` to `[min, max]`, then rounds to `precision` decimal places.
 *
 * The rounding step is what eliminates FP drift from accumulated step
 * arithmetic — without it, repeated `value + 0.1` calls would accumulate
 * `0.10000000000000003` style noise.
 *
 * `Number(x.toFixed(precision))` is the standard JS pattern for "round to
 * N decimals and discard the trailing zeros that toFixed adds." It's
 * spec-grounded and handles negative numbers correctly.
 */
export function clampAndRound(v: number, min: number, max: number, precision: number): number {
  const clamped = Math.max(min, Math.min(max, v));
  if (precision <= 0) return clamped;
  return Number(clamped.toFixed(precision));
}

/**
 * Parses `text` as a number. In float mode (`precision > 0`), accepts
 * decimal input via parseFloat. In integer mode, parseInt — which
 * truncates `'1.5'` to `1`, matching the existing pre-precision behavior
 * for callers who didn't opt into decimal mode.
 *
 * Returns `null` for un-parseable input (consumer reverts to current value).
 */
export function parseValue(text: string, precision: number): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = precision > 0 ? parseFloat(trimmed) : parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Formats `v` for display. In float mode, uses toFixed so trailing zeros
 * appear (`1.5` → `'1.50'` at precision 2). In integer mode, uses String
 * (matches pre-precision behavior).
 */
export function formatValue(v: number, precision: number): string {
  if (precision <= 0) return String(v);
  return v.toFixed(precision);
}
