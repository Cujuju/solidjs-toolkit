import { describe, expect, it } from 'vitest';
import { createLayout } from '../core/layout';

const keys = (n: number, from = 0): string[] => Array.from({ length: n }, (_, i) => `k${from + i}`);

describe('createLayout', () => {
  it('stacks rows up from the bottom, newest first, after the end padding', () => {
    const l = createLayout(() => 10, 4);
    l.setKeys(keys(3));
    expect([0, 1, 2].map((i) => l.startAt(i))).toEqual([24, 14, 4]);
    expect(l.total()).toBe(34);
  });

  it('keeps measured sizes with their keys across prepend, append and same-count replacement', () => {
    const l = createLayout(() => 10);
    l.setKeys(['a', 'b', 'c']);
    l.setSize('b', 50);
    l.setKeys(['x', 'a', 'b', 'c', 'd']);
    expect(l.sizeAt(l.indexOf('b'))).toBe(50);
    l.setKeys(['p', 'q', 'r', 's', 't']);
    expect([0, 1, 2, 3, 4].map((i) => l.sizeAt(i))).toEqual([10, 10, 10, 10, 10]);
    expect(l.measured('b')).toBe(false);
  });

  it('a row measured above another leaves the lower one in place', () => {
    const l = createLayout(() => 10);
    l.setKeys(keys(4));
    const before = l.startAt(2);
    l.setSize('k0', 100);
    expect(l.startAt(2)).toBe(before);
    expect(l.total()).toBe(130);
  });

  it('reports a change only when the size differs', () => {
    const l = createLayout(() => 10);
    l.setKeys(['a']);
    expect(l.setSize('a', 10)).toBe(false);
    expect(l.measured('a')).toBe(true);
    expect(l.setSize('a', 12)).toBe(true);
    expect(l.setSize('gone', 12)).toBe(false);
  });

  it('invalidate keeps sizes as estimates but marks them unmeasured', () => {
    const l = createLayout(() => 10);
    l.setKeys(['a']);
    l.setSize('a', 30);
    l.invalidate();
    expect(l.measured('a')).toBe(false);
    expect(l.sizeAt(0)).toBe(30);
  });

  it('uses the per-row estimate', () => {
    const l = createLayout((key) => (key.startsWith('day') ? 20 : 40));
    l.setKeys(['day1', 'm1']);
    expect(l.total()).toBe(60);
  });

  it('range covers the rows touching the window, widened by overscan', () => {
    const l = createLayout(() => 10);
    l.setKeys(keys(100));
    // Window 0..25 from the bottom: rows 99 (0-10), 98 (10-20), 97 (20-30).
    expect(l.range(0, 25, 0)).toEqual({ first: 97, last: 99 });
    expect(l.range(0, 25, 2)).toEqual({ first: 95, last: 99 });
    // Window 105..118: rows 89 (100-110), 88 (110-120).
    expect(l.range(105, 118, 0)).toEqual({ first: 88, last: 89 });
  });

  it('range and indexAt clamp past either end', () => {
    const l = createLayout(() => 10, 5);
    l.setKeys(keys(3));
    expect(l.range(-50, 2, 0)).toEqual({ first: 2, last: 2 });
    expect(l.range(500, 900, 0)).toEqual({ first: 0, last: 0 });
    expect(l.indexAt(1000)).toBe(0);
    expect(l.indexAt(0)).toBe(2);
    expect(createLayout(() => 10).range(0, 10, 3)).toEqual({ first: 0, last: -1 });
  });

  it('end padding moves every row', () => {
    const l = createLayout(() => 10);
    l.setKeys(keys(2));
    l.setEndPadding(8);
    expect(l.startAt(1)).toBe(8);
    expect(l.total()).toBe(28);
  });
});
