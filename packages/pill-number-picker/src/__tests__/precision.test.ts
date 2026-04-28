import { describe, it, expect } from 'vitest';
import {
  decimalsOf,
  effectivePrecision,
  clampAndRound,
  parseValue,
  formatValue,
} from '../_internal/precision';

describe('decimalsOf', () => {
  it.each([
    [0, 0],
    [1, 0],
    [-7, 0],
    [100, 0],
    [0.5, 1],
    [0.05, 2],
    [0.001, 3],
    [-0.25, 2],
    [1.234567, 6],
  ])('decimalsOf(%s) === %s', (input, expected) => {
    expect(decimalsOf(input)).toBe(expected);
  });

  it('handles scientific notation (1e-N where toString collapses to exponent form)', () => {
    // 1e-7.toString() === '1e-7' — without scientific handling we'd return 0.
    expect(decimalsOf(1e-7)).toBe(7);
    expect(decimalsOf(2e-3)).toBe(3);
    expect(decimalsOf(1.5e-4)).toBe(5);  // mantissa contributes 1, exponent contributes 4
  });

  it('returns 0 for non-finite inputs (NaN, Infinity) — not actionable as precision', () => {
    expect(decimalsOf(NaN)).toBe(0);
    expect(decimalsOf(Infinity)).toBe(0);
    expect(decimalsOf(-Infinity)).toBe(0);
  });
});

describe('effectivePrecision', () => {
  it('explicit prop wins over step inference', () => {
    expect(effectivePrecision(0.5, 3)).toBe(3);
    expect(effectivePrecision(1, 2)).toBe(2);
  });

  it('explicit precision=0 forces integer mode even with non-integer step', () => {
    expect(effectivePrecision(0.5, 0)).toBe(0);
  });

  it('falls back to step inference when prop is undefined', () => {
    expect(effectivePrecision(0.5, undefined)).toBe(1);
    expect(effectivePrecision(0.01, undefined)).toBe(2);
    expect(effectivePrecision(1, undefined)).toBe(0);
  });

  it('floors fractional/negative explicit precisions to safe values', () => {
    expect(effectivePrecision(1, 2.7)).toBe(2);
    expect(effectivePrecision(1, -1)).toBe(0);
  });
});

describe('clampAndRound', () => {
  it('clamps without rounding when precision is 0 (integer mode)', () => {
    expect(clampAndRound(5, 1, 10, 0)).toBe(5);
    expect(clampAndRound(-3, 1, 10, 0)).toBe(1);
    expect(clampAndRound(99, 1, 10, 0)).toBe(10);
  });

  it('rounds to precision when in float mode', () => {
    expect(clampAndRound(1.234567, 0, 10, 2)).toBe(1.23);
    expect(clampAndRound(1.5, 0, 10, 1)).toBe(1.5);
    expect(clampAndRound(2.5, 0, 10, 0)).toBe(2.5);  // precision 0 → no rounding
  });

  it('eliminates accumulated FP drift (the 0.1 + 0.2 case)', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754. Without rounding, every
    // increment by 0.1 leaks more drift; with precision=1, it stays clean.
    const drifted = 0.1 + 0.2;
    expect(clampAndRound(drifted, 0, 10, 1)).toBe(0.3);
  });

  it('rounds clamped boundary values too', () => {
    // value above max: clamp first, then round (same effect, kept consistent)
    expect(clampAndRound(15.6789, 0, 10, 2)).toBe(10);
  });

  it('handles negative numbers correctly', () => {
    expect(clampAndRound(-1.234, -10, 0, 2)).toBe(-1.23);
    expect(clampAndRound(-15, -10, 0, 0)).toBe(-10);
  });
});

describe('parseValue', () => {
  it('returns null for empty / whitespace-only input', () => {
    expect(parseValue('', 0)).toBeNull();
    expect(parseValue('   ', 0)).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseValue('abc', 0)).toBeNull();
    expect(parseValue('--', 2)).toBeNull();
  });

  it('parses integers in integer mode', () => {
    expect(parseValue('42', 0)).toBe(42);
    expect(parseValue('-7', 0)).toBe(-7);
  });

  it('integer mode truncates decimal input (preserves pre-precision behavior)', () => {
    // parseInt('1.5') === 1 — consumer who didn't opt into float mode gets the
    // current behavior unchanged. Avoids surprising 'rounding' rules.
    expect(parseValue('1.5', 0)).toBe(1);
    expect(parseValue('99.9', 0)).toBe(99);
  });

  it('parses decimals in float mode', () => {
    expect(parseValue('1.5', 1)).toBe(1.5);
    expect(parseValue('0.01', 2)).toBe(0.01);
    expect(parseValue('-3.14', 2)).toBe(-3.14);
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseValue('  42  ', 0)).toBe(42);
    expect(parseValue(' 1.5 ', 1)).toBe(1.5);
  });
});

describe('formatValue', () => {
  it('uses String() in integer mode (no trailing zeros)', () => {
    expect(formatValue(0, 0)).toBe('0');
    expect(formatValue(42, 0)).toBe('42');
    expect(formatValue(-7, 0)).toBe('-7');
  });

  it('uses toFixed() in float mode (trailing zeros preserved)', () => {
    expect(formatValue(1.5, 2)).toBe('1.50');
    expect(formatValue(0, 2)).toBe('0.00');
    expect(formatValue(2, 1)).toBe('2.0');
    expect(formatValue(-3.1, 2)).toBe('-3.10');
  });

  it('rounds for display when value has more decimals than precision', () => {
    expect(formatValue(1.234567, 2)).toBe('1.23');
    expect(formatValue(1.999, 2)).toBe('2.00');
  });
});
