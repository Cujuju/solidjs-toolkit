/**
 * Pure helpers for PillNumberPicker — extracted so they can be unit-tested
 * without involving the Solid rendering pipeline.
 */

export type PnpLayout =
  | 'value-inc-dec'
  | 'value-dec-inc'
  | 'inc-value-dec'
  | 'dec-value-inc'
  | 'inc-dec-value'
  | 'dec-inc-value'
  | 'v-inc-value-dec'
  | 'v-dec-value-inc';

export type PnpItem = 'value' | 'inc' | 'dec';

/**
 * Parses a layout token string into the ordered list of items to render.
 * Drops the `v-` prefix if present (used separately to set flex-direction).
 */
export function parseLayout(layout: PnpLayout): PnpItem[] {
  return layout.replace(/^v-/, '').split('-') as PnpItem[];
}

/**
 * Clamps a value into [min, max]. Returns min/max when value is out of bounds,
 * otherwise the value unchanged.
 */
export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Auto-width (px) for the value cell so the widest formatted number (and
 * one digit of headroom) fits without jumping on increment. Each monospace
 * digit is ~8px wide; the +1 digit is headroom, and +8px is cell padding.
 *
 * Width is sized for the longer of `min` and `max`'s formatted strings —
 * a `min=-100, max=10` range needs 4 characters for `-100`, not 2 for `10`.
 * In float mode (precision > 0), the format uses `toFixed(precision)` so
 * trailing zeros are accounted for: `max=2.5, precision=2` gives `'2.50'`,
 * which is wider than raw `String(max).length` would estimate.
 *
 * Defaults preserve the original `autoValueWidthPx(max)` behavior:
 * `autoValueWidthPx(99) === 32` and `autoValueWidthPx(100) === 40` still
 * hold when min defaults to 1 and precision to 0.
 */
export function autoValueWidthPx(max: number, min: number = 1, precision: number = 0): number {
  const fmt = (v: number): string => (precision > 0 ? v.toFixed(precision) : String(v));
  const widest = Math.max(fmt(max).length, fmt(min).length);
  return Math.max(32, (widest + 1) * 8 + 8);
}
