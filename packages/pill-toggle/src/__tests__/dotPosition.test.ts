import { describe, it, expect } from 'vitest';
import { centerOffset, DOT_INSET_PX, dotTranslate } from '../_internal/dotPosition';

describe('DOT_INSET_PX', () => {
  it('is the 2px track gap the stylesheet mirrors as --tp-dot-inset', () => {
    expect(DOT_INSET_PX).toBe(2);
  });
});

describe('dotTranslate', () => {
  // Reference geometry: width=32, dotSize=14, inset=2 (md preset).
  // Off:           '2px'
  // On:            32 - 14 - 2 = 16  → '16px'
  // Indeterminate: (32 - 14) / 2 = 9 → '9px'

  it('off (enabled=false): the inset from the left', () => {
    expect(dotTranslate(false, false, 32, 14, DOT_INSET_PX)).toBe('2px');
  });

  it('on (enabled=true): width - dotSize - inset from left', () => {
    expect(dotTranslate(true, false, 32, 14, DOT_INSET_PX)).toBe('16px');
  });

  it('indeterminate=true: centered ((width - dotSize) / 2)', () => {
    expect(dotTranslate(false, true, 32, 14, DOT_INSET_PX)).toBe('9px');
    expect(dotTranslate(true, true, 32, 14, DOT_INSET_PX)).toBe('9px');
  });

  it('indeterminate takes precedence over enabled', () => {
    // Both enabled values produce the same indeterminate position —
    // confirms enabled is ignored when indeterminate=true.
    const offIndet = dotTranslate(false, true, 40, 18, DOT_INSET_PX);
    const onIndet = dotTranslate(true, true, 40, 18, DOT_INSET_PX);
    expect(offIndet).toBe(onIndet);
    expect(offIndet).toBe('11px'); // (40 - 18) / 2 = 11
  });

  it('handles odd geometries (fractional center)', () => {
    // width=33, dotSize=14 → center at (33-14)/2 = 9.5
    expect(dotTranslate(false, true, 33, 14, DOT_INSET_PX)).toBe('9.5px');
  });

  it('handles xs preset (24×12 pill, dot=8)', () => {
    expect(dotTranslate(false, false, 24, 8, DOT_INSET_PX)).toBe('2px');
    expect(dotTranslate(true, false, 24, 8, DOT_INSET_PX)).toBe('14px'); // 24 - 8 - 2
    expect(dotTranslate(false, true, 24, 8, DOT_INSET_PX)).toBe('8px');  // (24 - 8) / 2
  });

  it('inset drives the off/on stops, not a hardcoded 2px (F073: same inset on both axes)', () => {
    expect(dotTranslate(false, false, 32, 10, 4)).toBe('4px');
    expect(dotTranslate(true, false, 32, 10, 4)).toBe('18px'); // 32 - 10 - 4
  });

  it('string width: calc() against the given length, all three stops', () => {
    expect(dotTranslate(false, false, '64px', 14, DOT_INSET_PX)).toBe('2px');
    expect(dotTranslate(true, false, '64px', 14, DOT_INSET_PX)).toBe('calc(64px - 14px - 2px)');
    expect(dotTranslate(false, true, '64px', 14, DOT_INSET_PX)).toBe('calc((64px - 14px) / 2)');
  });

  it("string dotSize: '100%' names the dot's own width (translateX percentage base)", () => {
    expect(dotTranslate(true, false, 32, '100%', DOT_INSET_PX)).toBe('calc(32px - 100% - 2px)');
    expect(dotTranslate(false, true, 32, '100%', DOT_INSET_PX)).toBe('calc((32px - 100%) / 2)');
  });

  it('string inset: emitted verbatim when off, subtracted when on', () => {
    expect(dotTranslate(false, false, 32, '24px', 'calc((18px - 24px) / 2)')).toBe('calc((18px - 24px) / 2)');
    expect(dotTranslate(true, false, 32, '24px', 'calc((18px - 24px) / 2)'))
      .toBe('calc(32px - 24px - calc((18px - 24px) / 2))');
  });

  it('all-string inputs stay a single valid calc()', () => {
    expect(dotTranslate(true, false, '4rem', '1.5rem', '0.25rem')).toBe('calc(4rem - 1.5rem - 0.25rem)');
  });
});

describe('centerOffset', () => {
  it('numeric: exact px, no calc()', () => {
    expect(centerOffset(18, 14)).toBe('2px');
    expect(centerOffset(18, 10)).toBe('4px');
  });

  it('numeric: the md preset (18px track, 14px dot) centres at DOT_INSET_PX', () => {
    expect(centerOffset(18, 14)).toBe(`${DOT_INSET_PX}px`);
  });

  it('numeric: fractional halves are kept', () => {
    expect(centerOffset(33, 14)).toBe('9.5px');
  });

  it('numeric: negative when the dot overhangs the track', () => {
    expect(centerOffset(18, 24)).toBe('-3px');
  });

  it('string extent: calc() against the pill box', () => {
    expect(centerOffset('100%', 14)).toBe('calc((100% - 14px) / 2)');
  });

  it('string dotSize: calc() against the numeric extent', () => {
    expect(centerOffset(18, '2rem')).toBe('calc((18px - 2rem) / 2)');
  });

  it('both strings: calc() with neither side converted', () => {
    expect(centerOffset('100%', '2rem')).toBe('calc((100% - 2rem) / 2)');
    expect(centerOffset('100%', '100%')).toBe('calc((100% - 100%) / 2)');
  });
});
