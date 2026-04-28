import { describe, it, expect } from 'vitest';
import { dotTranslate } from '../_internal/dotPosition';

describe('dotTranslate', () => {
  // Reference geometry: width=32, dotSize=14 (md preset).
  // Off:           '2px'
  // On:            32 - 14 - 2 = 16  → '16px'
  // Indeterminate: (32 - 14) / 2 = 9 → '9px'

  it('off (enabled=false): 2px from left', () => {
    expect(dotTranslate(false, false, 32, 14)).toBe('2px');
  });

  it('on (enabled=true): width - dotSize - 2 from left', () => {
    expect(dotTranslate(true, false, 32, 14)).toBe('16px');
  });

  it('indeterminate=true: centered ((width - dotSize) / 2)', () => {
    expect(dotTranslate(false, true, 32, 14)).toBe('9px');
    expect(dotTranslate(true, true, 32, 14)).toBe('9px');
  });

  it('indeterminate takes precedence over enabled', () => {
    // Both enabled values produce the same indeterminate position —
    // confirms enabled is ignored when indeterminate=true.
    const offIndet = dotTranslate(false, true, 40, 18);
    const onIndet = dotTranslate(true, true, 40, 18);
    expect(offIndet).toBe(onIndet);
    expect(offIndet).toBe('11px'); // (40 - 18) / 2 = 11
  });

  it('handles odd geometries (fractional center)', () => {
    // width=33, dotSize=14 → center at (33-14)/2 = 9.5
    expect(dotTranslate(false, true, 33, 14)).toBe('9.5px');
  });

  it('handles xs preset (24×12 pill, dot=8)', () => {
    expect(dotTranslate(false, false, 24, 8)).toBe('2px');
    expect(dotTranslate(true, false, 24, 8)).toBe('14px'); // 24 - 8 - 2
    expect(dotTranslate(false, true, 24, 8)).toBe('8px');  // (24 - 8) / 2
  });
});
