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
 * Auto-width (px) for the value cell, sized for the longer of `min` and `max` formatted, plus
 * one digit of headroom so incrementing never makes the cell jump.
 */
export function autoValueWidthPx(max: number, min: number = 1, precision: number = 0): number {
  const fmt = (v: number): string => (precision > 0 ? v.toFixed(precision) : String(v));
  const widest = Math.max(fmt(max).length, fmt(min).length);
  return Math.max(32, (widest + 1) * 8 + 8);
}
