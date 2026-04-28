import { describe, it, expect } from 'vitest';
import { parseLayout, clampValue, autoValueWidthPx } from '../_internal/layout';

describe('parseLayout', () => {
  it.each([
    ['value-inc-dec', ['value', 'inc', 'dec']],
    ['value-dec-inc', ['value', 'dec', 'inc']],
    ['inc-value-dec', ['inc', 'value', 'dec']],
    ['dec-value-inc', ['dec', 'value', 'inc']],
    ['inc-dec-value', ['inc', 'dec', 'value']],
    ['dec-inc-value', ['dec', 'inc', 'value']],
    ['v-inc-value-dec', ['inc', 'value', 'dec']],
    ['v-dec-value-inc', ['dec', 'value', 'inc']],
  ] as const)('%s → %j', (input, expected) => {
    expect(parseLayout(input)).toEqual(expected);
  });
});

describe('clampValue', () => {
  it('returns value when within [min, max]', () => {
    expect(clampValue(5, 1, 10)).toBe(5);
  });
  it('returns min when value below', () => {
    expect(clampValue(-3, 1, 10)).toBe(1);
  });
  it('returns max when value above', () => {
    expect(clampValue(50, 1, 10)).toBe(10);
  });
  it('works when min === max', () => {
    expect(clampValue(5, 7, 7)).toBe(7);
  });
  it('handles negative ranges', () => {
    expect(clampValue(-5, -10, -1)).toBe(-5);
    expect(clampValue(-20, -10, -1)).toBe(-10);
  });
});

describe('autoValueWidthPx', () => {
  it('minimum 32px even for small max', () => {
    expect(autoValueWidthPx(9)).toBe(32);
  });
  it('grows with digit count (default min=1, precision=0)', () => {
    // max=99: 2 digits + 1 headroom = 3 digits × 8 + 8 padding = 32
    expect(autoValueWidthPx(99)).toBe(32);
    // max=100: 3 digits + 1 = 4 × 8 + 8 = 40
    expect(autoValueWidthPx(100)).toBe(40);
    // max=9999: 4 + 1 = 5 × 8 + 8 = 48
    expect(autoValueWidthPx(9999)).toBe(48);
  });
  it('sizes for negative min when min is wider than max formatted', () => {
    // max=10 ('10' = 2 chars), min=-100 ('-100' = 4 chars). Widest = 4.
    // (4+1)*8 + 8 = 48.
    expect(autoValueWidthPx(10, -100)).toBe(48);
  });
  it('accounts for precision (toFixed adds trailing zeros)', () => {
    // max=2.5, precision=2 → '2.50' = 4 chars. min=1, precision=2 → '1.00' = 4 chars.
    // (4+1)*8 + 8 = 48.
    expect(autoValueWidthPx(2.5, 1, 2)).toBe(48);
    // max=99, precision=0 → unchanged (32).
    expect(autoValueWidthPx(99, 1, 0)).toBe(32);
  });
});
