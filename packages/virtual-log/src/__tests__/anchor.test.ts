import { describe, expect, it } from 'vitest';
import { alignedOffset, anchoredOffset, captureAnchor, clamp } from '../core/anchor';
import { createLayout } from '../core/layout';

/** 20 rows of 10px, k0 oldest; k19 spans 0-10, k10 spans 90-100. */
const make = () => {
  const l = createLayout(() => 10);
  l.setKeys(Array.from({ length: 20 }, (_, i) => `k${i}`));
  return l;
};

describe('top-edge anchor (reading history)', () => {
  // Viewport L=50, height 45: top edge at 95, inside k10 (90-100).
  it('a row wholly below the top edge growing is compensated', () => {
    const l = make();
    const snap = captureAnchor(l, 95, 50)!;
    l.setSize('k15', 40); // below the view's top edge, grows by 30
    expect(anchoredOffset(l, snap)).toBe(80);
  });

  it('the row cut by the top edge grows upward, out of view: no change', () => {
    const l = make();
    const snap = captureAnchor(l, 95, 50)!;
    l.setSize('k10', 60);
    expect(anchoredOffset(l, snap)).toBe(50);
  });

  it('rows above (older, prepended or measured) never move the view', () => {
    const l = make();
    const snap = captureAnchor(l, 95, 50)!;
    l.setSize('k2', 300);
    l.setKeys(['old1', 'old2', ...Array.from({ length: 20 }, (_, i) => `k${i}`)]);
    expect(anchoredOffset(l, snap)).toBe(50);
  });

  it('a new newest row lifts the view by its height, keeping what is read in place', () => {
    const l = make();
    const snap = captureAnchor(l, 95, 50)!;
    l.setKeys([...Array.from({ length: 20 }, (_, i) => `k${i}`), 'new']);
    expect(anchoredOffset(l, snap)).toBe(60);
  });

  it('falls back to a neighbour when the anchored row is removed', () => {
    const l = make();
    const snap = captureAnchor(l, 95, 50)!;
    l.setKeys(Array.from({ length: 20 }, (_, i) => `k${i}`).filter((k) => k !== 'k10'));
    // k11 kept its start (80), which sat 30 above L.
    expect(anchoredOffset(l, snap)).toBe(50);
  });

  it('is null when nothing pinned survives (a channel switch)', () => {
    const l = make();
    const snap = captureAnchor(l, 95, 50)!;
    l.setKeys(['x', 'y']);
    expect(anchoredOffset(l, snap)).toBeNull();
  });
});

describe('bottom-edge anchor (following, scrolled a little up)', () => {
  it('a row below the bottom edge growing keeps the bottom edge still', () => {
    const l = make();
    // L=25: bottom edge inside k17 (20-30).
    const snap = captureAnchor(l, 25, 25)!;
    l.setSize('k19', 50);
    expect(anchoredOffset(l, snap)).toBe(65);
  });
});

describe('alignedOffset', () => {
  it('centers a row', () => {
    expect(alignedOffset(make(), 'k10', 'center', 0, 40, 0)).toBe(75);
  });

  it('places a row its bottom a set distance above the view bottom', () => {
    // k10 spans 90-100: its bottom 15 above the view's bottom.
    expect(alignedOffset(make(), 'k10', { bottom: 15 }, 0, 40, 0)).toBe(75);
    expect(alignedOffset(make(), 'k10', { bottom: -5 }, 0, 40, 0)).toBe(95);
  });

  it('auto: leaves a visible row alone, else moves the least', () => {
    const l = make();
    expect(alignedOffset(l, 'k17', 'auto', 15, 30, 0)).toBe(15);
    // k10 (90-100) above a viewport 0-30: its top meets the top edge.
    expect(alignedOffset(l, 'k10', 'auto', 0, 30, 0)).toBe(70);
    // k19 (0-10) below a viewport 50-80: its bottom meets the bottom edge.
    expect(alignedOffset(l, 'k19', 'auto', 50, 30, 0)).toBe(0);
  });

  it('auto keeps the end padding under the newest row', () => {
    const l = createLayout(() => 10, 8);
    l.setKeys(['a', 'b']);
    expect(alignedOffset(l, 'b', 'auto', 30, 25, 8)).toBe(0);
  });

  it('a row taller than the viewport shows its top', () => {
    const l = make();
    l.setSize('k10', 100);
    expect(alignedOffset(l, 'k10', 'auto', 0, 40, 0)).toBe(150);
  });

  it('unknown keys are null', () => {
    expect(alignedOffset(make(), 'nope', 'auto', 0, 40, 0)).toBeNull();
  });
});

describe('clamp', () => {
  it('clamps, and an inverted range clamps to its low end', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(5, 0, -10)).toBe(0);
  });
});
