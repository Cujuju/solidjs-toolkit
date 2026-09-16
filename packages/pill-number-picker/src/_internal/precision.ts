/**
 * Pure decimal/precision helpers. `parseInt` truncates decimals, step arithmetic drifts
 * (`0.1 + 0.2`), and `toFixed` keeps trailing zeros the display needs.
 */

/**
 * Decimal places in `n`. Handles scientific notation: `1e-7` stringifies as `'1e-7'`, so the
 * dot-split path alone would report 0 decimals.
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
 * Precision for parsing, rounding and display: explicit prop, else inferred from `step`'s own
 * decimals, else 0.
 */
export function effectivePrecision(stepProp: number, precisionProp: number | undefined): number {
  if (precisionProp !== undefined) return Math.max(0, Math.floor(precisionProp));
  return decimalsOf(stepProp);
}

/**
 * Clamp to `[min, max]`, then round to `precision`. The rounding is what stops accumulated
 * step arithmetic drifting into `0.10000000000000003`.
 */
export function clampAndRound(v: number, min: number, max: number, precision: number): number {
  const clamped = Math.max(min, Math.min(max, v));
  if (precision <= 0) return clamped;
  return Number(clamped.toFixed(precision));
}

/**
 * Parse `text`. Float mode uses parseFloat; integer mode uses parseInt, which truncates
 * `'1.5'` as the pre-precision behaviour did. `null` when un-parseable.
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
