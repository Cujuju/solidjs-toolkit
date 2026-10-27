import { describe, expect, it } from 'vitest';
import { computeTileLayout, minimumSize } from '../layout';
import { planMove } from '../plan';
import { planTabFold } from '../tabStripFold';
import { addToTabs, dock, insertTile, moveTab, removeTile, setActiveTab, swapTiles } from '../tileEdits';
import { normalize } from '../tileRepair';
import { findSlot, tileIds, type TileNode, type TileSplit, type TileTabs } from '../tileTree';

const t = (id: string) => ({ kind: 'tile' as const, id });
const tabs = (active: number, ...ids: string[]): TileTabs => ({ kind: 'tabs', active, children: ids.map(t) });
const row = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'row', sizes, children });
const SIZE = { width: 410, height: 200 };
const options = { gapPx: 10, minSizes: new Map([['a', { width: 50, height: 50 }], ['b', { width: 80, height: 120 }]]) };

describe('tab groups', () => {
  it('joins a tile to a slot as its active tab, and leaves as a plain tile again', () => {
    const grouped = addToTabs(row([1, 1], t('a'), t('b')), 'b', 'a');
    expect(grouped).toEqual(tabs(1, 'a', 'b'));
    expect(removeTile(grouped, 'b')).toEqual(t('a'));
    expect(insertTile(row([1, 1], t('a'), t('b')), 'c', 'b', 'center')).toEqual(row([1, 1], t('a'), tabs(1, 'b', 'c')));
  });

  it('docks a tab beside its own group, which stays put', () => {
    expect(dock(tabs(0, 'a', 'b'), 'a', 'a', 'right')).toEqual(row([1, 1], t('b'), t('a')));
  });

  it('reorders and selects tabs, keeping the same tab active across a move', () => {
    const group = tabs(0, 'a', 'b', 'c');
    expect(moveTab(group, 'a', 2)).toEqual(tabs(2, 'b', 'c', 'a'));
    expect(setActiveTab(group, 'c', 1)).toEqual(tabs(1, 'a', 'b', 'c'));
    expect(setActiveTab(group, 'a', 5)).toBe(group);
  });

  it('removing the active tab keeps its position in range', () => {
    expect(removeTile(tabs(2, 'a', 'b', 'c'), 'c')).toEqual(tabs(1, 'a', 'b'));
  });

  it('swaps a tile into a tab position', () => {
    expect(swapTiles(row([1, 1], tabs(0, 'a', 'b'), t('c')), 'c', 'a')).toEqual(row([1, 1], tabs(0, 'c', 'b'), t('a')));
  });

  it('normalizes saved groups: unknown tabs drop, a lone tab becomes a tile, the active tab is kept', () => {
    expect(normalize({ kind: 'tabs', active: 2, children: [t('a'), t('x'), t('b')] }, new Set(['a', 'b']))).toEqual(tabs(1, 'a', 'b'));
    expect(normalize({ kind: 'tabs', active: 0, children: [t('a'), t('a')] })).toEqual(t('a'));
  });

  it('lays out every tab in its group box, at the largest tab minimum', () => {
    const root = row([1, 1], tabs(0, 'a', 'b'), t('c'));
    const layout = computeTileLayout(root, SIZE, options);
    expect(layout.tiles.get('a')).toEqual(layout.tiles.get('b'));
    expect(layout.slots).toHaveLength(2);
    expect(minimumSize(tabs(0, 'a', 'b'), options)).toEqual({ width: 80, height: 120 });
    expect(findSlot(root, 'b')?.slot).toBe(root.children[0]);
  });

  it('a centre move onto its own group is no move; onto another slot it swaps with the active tab', () => {
    const root = row([1, 1], tabs(1, 'a', 'b'), t('c'));
    expect(planMove(root, 'a', 'b', 'center', SIZE, options)).toBeNull();
    expect(tileIds(planMove(root, 'c', 'b', 'center', SIZE, options)!.next)).toEqual(['a', 'c', 'b']);
  });
});

describe('tab strip fold', () => {
  const strip = [{ full: 100, compact: 30, active: true }, { full: 100, compact: 30, active: false }];
  const input = { tabs: strip, trailing: 0, foldControl: 20, previous: 'full' as const };
  it('folds inactive names first, then every name', () => {
    expect(planTabFold({ ...input, room: 200 })).toBe('full');
    expect(planTabFold({ ...input, room: 150 })).toBe('inactive-icons');
    expect(planTabFold({ ...input, room: 90 })).toBe('icons');
    expect(planTabFold({ ...input, room: null })).toBe('full');
  });
  it('needs extra room to unfold, so a boundary width cannot flicker', () => {
    expect(planTabFold({ ...input, room: 200, previous: 'inactive-icons' })).toBe('inactive-icons');
  });
});
