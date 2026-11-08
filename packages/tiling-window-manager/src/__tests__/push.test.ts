import { describe, expect, it } from 'vitest';
import { computeTileLayout, type TileSize } from '../layout';
import { pushedLayout, type PushTarget } from '../push';
import type { TileNode, TileSplit } from '../tileTree';

const t = (id: string): TileNode => ({ kind: 'tile', id });
const row = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'row', sizes, children });
const col = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'column', sizes, children });
const GAP = 10;
const WIDTH = 400;
const PX_DIGITS = 6;
const options = (mins: Record<string, number> = {}) => ({
  gapPx: GAP, minSizes: new Map(Object.entries(mins).map(([id, px]) => [id, { width: 0, height: px }])),
});

/** Pushes `target` by `delta`, then lays the result out at its new height and returns every tile's height and top. */
function push(root: TileNode, heightPx: number, target: PushTarget, delta: number, mins: Record<string, number> = {}, floorPx = 0) {
  const size: TileSize = { width: WIDTH, height: heightPx };
  const before = computeTileLayout(root, size, options(mins));
  const next = pushedLayout(root, before, heightPx, target, delta, options(mins), floorPx);
  const after = computeTileLayout(next.root, { width: WIDTH, height: next.heightPx }, options(mins));
  const rects = Object.fromEntries([...after.tiles].map(([id, rect]) => [id, { y: rect.y, height: rect.height }]));
  return { heightPx: next.heightPx, rects };
}
const expectRects = (actual: Record<string, { y: number; height: number }>, expected: Record<string, [y: number, height: number]>) =>
  Object.entries(expected).forEach(([id, [y, height]]) => {
    expect(actual[id].y).toBeCloseTo(y, PX_DIGITS);
    expect(actual[id].height).toBeCloseTo(height, PX_DIGITS);
  });

describe('pushedLayout', () => {
  // a 100px, b 200px: 100 + 10 + 200.
  const stack = col([1, 2], t('a'), t('b'));

  it('grows the tile above a divider and moves the one below without resizing it', () => {
    const result = push(stack, 310, { path: [], gap: 0 }, 40);
    expect(result.heightPx).toBe(350);
    expectRects(result.rects, { a: [0, 140], b: [150, 200] });
  });

  it('stops shrinking at the tile above it’s minimum and leaves the tile below alone', () => {
    const result = push(stack, 310, { path: [], gap: 0 }, -90, { a: 60 });
    expect(result.heightPx).toBe(270);
    expectRects(result.rects, { a: [0, 60], b: [70, 200] });
  });

  it('makes row neighbours follow at their bottom edge, so tiles below keep their size', () => {
    // Top row 210px: a beside b (100) over c (100); d 100px below.
    const root = col([210, 100], row([1, 1], t('a'), col([1, 1], t('b'), t('c'))), t('d'));
    const result = push(root, 320, { path: [0, 1], gap: 0 }, 30);
    expect(result.heightPx).toBe(350);
    expectRects(result.rects, { a: [0, 240], b: [0, 130], c: [140, 100], d: [250, 100] });
  });

  it('limits a shrink by a row neighbour’s minimum too', () => {
    const root = col([210, 100], row([1, 1], t('a'), col([1, 1], t('b'), t('c'))), t('d'));
    const result = push(root, 320, { path: [0, 1], gap: 0 }, -80, { a: 180 });
    expect(result.heightPx).toBe(290);
    expectRects(result.rects, { a: [0, 180], b: [0, 70], c: [80, 100] });
  });

  it('resizes only the tiles touching the bottom edge', () => {
    // a 100px over a 210px row: b beside c (100) over d (100).
    const root = col([100, 210], t('a'), row([1, 1], t('b'), col([1, 1], t('c'), t('d'))));
    const result = push(root, 320, 'bottom', 40);
    expect(result.heightPx).toBe(360);
    expectRects(result.rects, { a: [0, 100], b: [110, 250], c: [110, 100], d: [220, 140] });
  });

  it('at the floor, a shrinking divider trades with the bottom tiles instead of shortening the workspace', () => {
    const result = push(stack, 310, { path: [], gap: 0 }, -40, {}, 310);
    expect(result.heightPx).toBe(310);
    expectRects(result.rects, { a: [0, 60], b: [70, 240] });
  });

  it('gives a row neighbour back what it followed, so only the dragged pair trades at the floor', () => {
    // Top row 210px: a beside b (100) over c (100); a shrink of b would also shrink a, then the bottom edge restores it.
    const root = row([1, 1], t('a'), col([1, 1], t('b'), t('c')));
    const result = push(root, 210, { path: [1], gap: 0 }, -30, {}, 210);
    expect(result.heightPx).toBe(210);
    expectRects(result.rects, { a: [0, 210], b: [0, 70], c: [80, 130] });
  });

  it('lets a row neighbour at its minimum stay put while the pair beside it trades at the floor', () => {
    const root = row([1, 1], t('a'), col([1, 1], t('b'), t('c')));
    const result = push(root, 210, { path: [1], gap: 0 }, -30, { a: 210, b: 60, c: 60 }, 210);
    expect(result.heightPx).toBe(210);
    expectRects(result.rects, { a: [0, 210], b: [0, 70], c: [80, 130] });
  });

  it('stops the bottom edge at the floor and still grows past it', () => {
    expect(push(stack, 310, 'bottom', -50, {}, 290).heightPx).toBe(290);
    expect(push(stack, 310, 'bottom', 50, {}, 290).heightPx).toBe(360);
  });

  it('rounds to whole pixels and leaves the tree alone for no movement', () => {
    const before = computeTileLayout(stack, { width: WIDTH, height: 310 }, options());
    expect(pushedLayout(stack, before, 310, 'bottom', 0.3, options())).toEqual({ root: stack, heightPx: 310 });
    expect(push(t('only'), 200, 'bottom', 25.6).heightPx).toBe(226);
  });
});
