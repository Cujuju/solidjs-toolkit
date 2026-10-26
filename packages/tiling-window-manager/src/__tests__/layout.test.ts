import { describe, expect, it } from 'vitest';
import { computeTileLayout, equalisedShares, resizedShares, type LayoutRect } from '../layout';
import { planInsertion, planMove, tileHitAt, TOO_SMALL } from '../plan';
import { insertTile } from '../tileTree';
import type { TileNode, TileSplit } from '../tileTree';

const t = (id: string): TileNode => ({ kind: 'tile', id });
const row = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'row', sizes, children });
const col = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'column', sizes, children });
const GAP = 10;
const PX_DIGITS = 6;
const expectRect = (actual: LayoutRect, expected: LayoutRect) =>
  (['x', 'y', 'width', 'height'] as const).forEach((k) => expect(actual[k]).toBeCloseTo(expected[k], PX_DIGITS));
const options = (mins: Record<string, number> = {}) => ({
  gapPx: GAP, minSizes: new Map(Object.entries(mins).map(([id, px]) => [id, { width: px, height: px }])),
});

describe('layout', () => {
  it('divides by share after gaps and reports one divider per gap', () => {
    const layout = computeTileLayout(row([1, 3], t('a'), t('b')), { width: 410, height: 100 }, options());
    expect(layout.tiles.get('a')).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(layout.tiles.get('b')).toEqual({ x: 110, y: 0, width: 300, height: 100 });
    expect(layout.handles.map((h) => h.rect)).toEqual([{ x: 100, y: 0, width: GAP, height: 100 }]);
  });

  it('holds a tile at its minimum and syncs the drag shares to the pixels', () => {
    const layout = computeTileLayout(row([1, 9], t('a'), t('b')), { width: 410, height: 100 }, options({ a: 150 }));
    expect(layout.tiles.get('a')!.width).toBe(150);
    // 150px and 250px of a 400px space, in a 10-share split.
    expect(layout.handles[0].sizes).toEqual([3.75, 6.25]);
  });

  it('resizes between the two sides only, stopping at a minimum', () => {
    const root = row([1, 1, 1], t('a'), t('b'), t('c'));
    const layout = computeTileLayout(root, { width: 320, height: 100 }, options({ b: 50 }));
    const first = layout.handles[0];
    const grown = resizedShares(first, 1000);
    expect(grown[2]).toBe(1);
    expect(grown[0] + grown[1]).toBeCloseTo(2);
    expect(grown[1] * 100).toBeCloseTo(50);
    expect(equalisedShares(first)).toEqual([1, 1, 1]);
  });

  it('plans an insertion that only splits the target', () => {
    const root = row([1, 1], t('a'), t('b'));
    const size = { width: 410, height: 200 };
    const plan = planInsertion(root, 'c', 'b', 'right', size, options());
    // b's 200px loses one gap and splits evenly; a keeps its 200px.
    if (!plan.valid) throw new Error(plan.reason);
    expect([plan.rect.x, plan.rect.width, plan.targetRect.x, plan.targetRect.width].map(Math.round)).toEqual([315, 95, 210, 95]);
    expect(planInsertion(root, 'c', 'b', 'right', size, options({ c: 200 }))).toMatchObject({ valid: false, reason: TOO_SMALL });
  });

  it('keeps every other tile in place for each valid plan', () => {
    const root = row([2, 1], col([1, 3], t('a'), t('b')), col([1, 1], t('c'), t('d')));
    const size = { width: 700, height: 500 };
    const opts = options({ a: 80, b: 60, c: 120, d: 40, e: 90 });
    const before = computeTileLayout(root, size, opts).tiles;
    const sides = ['left', 'right', 'top', 'bottom'] as const;
    let valid = 0;
    for (const target of ['a', 'b', 'c', 'd']) for (const side of sides) {
      const plan = planInsertion(root, 'e', target, side, size, opts);
      if (!plan.valid) continue;
      valid++;
      const after = computeTileLayout(insertTile(root, 'e', target, side, plan.shares), size, opts).tiles;
      for (const [id, rect] of before) if (id !== target) expectRect(after.get(id)!, rect);
      expectRect(after.get('e')!, plan.rect);
    }
    expect(valid).toBeGreaterThan(0);
  });

  it('plans moves and finds the tile and zone under a point', () => {
    const root = row([1, 1], t('a'), t('b'));
    const size = { width: 410, height: 200 };
    expect(planMove(root, 'a', 'b', 'center', size, options())?.rect.x).toBe(210);
    const tiles = computeTileLayout(root, size, options()).tiles;
    expect(tileHitAt(tiles, 400, 100, ['left', 'right', 'top', 'bottom', 'center'])).toMatchObject({ targetId: 'b', zone: 'right' });
    expect(tileHitAt(tiles, 205, 100, ['center'])).toBeNull();
    expect(tileHitAt(tiles, 300, 100, ['center'], 'b')).toBeNull();
  });
});
