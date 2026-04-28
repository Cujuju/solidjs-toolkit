import { describe, it, expect } from 'vitest';
import { strokeOuterOffset } from '../_internal/placement';

const NO_BORDER = { t: 0, r: 0, b: 0, l: 0 };
const BORDER_1 = { t: 1, r: 1, b: 1, l: 1 };
const BORDER_ASYM = { t: 2, r: 1, b: 2, l: 1 };

describe('strokeOuterOffset', () => {
  describe('outside placement', () => {
    it('offsets each side by strokeWidth (no border)', () => {
      expect(strokeOuterOffset('outside', 2, NO_BORDER, 0)).toEqual({
        t: 2, r: 2, b: 2, l: 2,
      });
    });

    it('offsets by strokeWidth regardless of parent border width', () => {
      // The 'outside' baseline is always strokeWidth past the border-outer.
      // It's the wrapper positioning (not computed here) that adds
      // borderWidth — this pure function only returns the offset PAST border.
      expect(strokeOuterOffset('outside', 2, BORDER_1, 0)).toEqual({
        t: 2, r: 2, b: 2, l: 2,
      });
    });
  });

  describe('center placement', () => {
    it('offsets by half strokeWidth', () => {
      expect(strokeOuterOffset('center', 4, NO_BORDER, 0)).toEqual({
        t: 2, r: 2, b: 2, l: 2,
      });
    });
  });

  describe('on-border placement', () => {
    it('returns zero offset (stroke outer at border-outer edge)', () => {
      expect(strokeOuterOffset('on-border', 2, BORDER_1, 0)).toEqual({
        t: 0, r: 0, b: 0, l: 0,
      });
    });
  });

  describe('inside placement', () => {
    it('offsets inward by border width per side (stroke outer at padding-edge)', () => {
      expect(strokeOuterOffset('inside', 2, BORDER_1, 0)).toEqual({
        t: -1, r: -1, b: -1, l: -1,
      });
    });

    it('handles asymmetric borders per side', () => {
      expect(strokeOuterOffset('inside', 2, BORDER_ASYM, 0)).toEqual({
        t: -2, r: -1, b: -2, l: -1,
      });
    });

    it('zero border → zero offset (same as on-border)', () => {
      expect(strokeOuterOffset('inside', 2, NO_BORDER, 0)).toEqual({
        t: 0, r: 0, b: 0, l: 0,
      });
    });
  });

  describe('strokeInset shift', () => {
    it('positive inset pushes all sides further inward', () => {
      // outside baseline +2, inset 1 → +1 on each side
      expect(strokeOuterOffset('outside', 2, NO_BORDER, 1)).toEqual({
        t: 1, r: 1, b: 1, l: 1,
      });
    });

    it('negative inset pushes outward', () => {
      // on-border baseline 0, inset -2 → +2 on each side
      expect(strokeOuterOffset('on-border', 2, NO_BORDER, -2)).toEqual({
        t: 2, r: 2, b: 2, l: 2,
      });
    });

    it('inset applies on top of asymmetric baseline', () => {
      // inside baseline = -border per side, then inset 1 → -border - 1
      expect(strokeOuterOffset('inside', 2, BORDER_ASYM, 1)).toEqual({
        t: -3, r: -2, b: -3, l: -2,
      });
    });
  });
});
