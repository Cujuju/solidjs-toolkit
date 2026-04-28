import { describe, it, expect } from 'vitest';
import { applyEasing } from '../_internal/easing';

describe('applyEasing', () => {
  it('returns raw progress unchanged when no easing is supplied (linear default)', () => {
    expect(applyEasing(0)).toBe(0);
    expect(applyEasing(0.25)).toBe(0.25);
    expect(applyEasing(0.5)).toBe(0.5);
    expect(applyEasing(1)).toBe(1);
  });

  it('identity easing matches no-easing behavior', () => {
    const identity = (t: number): number => t;
    for (const v of [0, 0.1, 0.333, 0.5, 0.777, 1]) {
      expect(applyEasing(v, identity)).toBe(applyEasing(v));
    }
  });

  it('quadratic ease-in (t * t) transforms correctly', () => {
    const easeIn = (t: number): number => t * t;
    expect(applyEasing(0, easeIn)).toBe(0);
    expect(applyEasing(0.5, easeIn)).toBe(0.25);
    expect(applyEasing(1, easeIn)).toBe(1);
  });

  it('clamps overshoot easings to [0, 1]', () => {
    const overshoot = (t: number): number => t * 2;          // 0.6 -> 1.2
    const undershoot = (t: number): number => t - 0.5;       // 0.2 -> -0.3
    expect(applyEasing(0.6, overshoot)).toBe(1);
    expect(applyEasing(0.2, undershoot)).toBe(0);
  });
});
