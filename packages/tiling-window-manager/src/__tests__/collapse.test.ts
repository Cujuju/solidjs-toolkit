import { describe, expect, it } from 'vitest';
import { computeTileLayout, resizedShares } from '../layout';
import {
  canCollapse, canCollapseAlone, collapseSlotAlone, expandSlotAlone, setSlotCollapsed, shareHolders,
} from '../tileCollapse';
import { dock, removeTile } from '../tileEdits';
import { normalize } from '../tileRepair';
import { findSlot, type CollapseEdge, type TileLeaf, type TileNode, type TileSplit } from '../tileTree';

const t = (id: string, edge?: CollapseEdge): TileLeaf => (edge ? { kind: 'tile', id, collapsed: { edge } } : { kind: 'tile', id });
const row = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'row', sizes, children });
const col = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'column', sizes, children });
const GAP = 10;
const STRIP = 30;
const SIZE = { width: 320, height: 100 };
const options = { gapPx: GAP, minSizes: new Map<string, { width: number; height: number }>(), barPx: STRIP, stripPx: STRIP };
const three = row([1, 1, 1], t('a'), t('b'), t('c'));
const collapsed = (root: TileNode, id: string) => findSlot(root, id)!.slot.collapsed?.edge;

describe('collapsible tiles', () => {
  it('folds a slot to a strip; only its open neighbour takes the space', () => {
    const before = computeTileLayout(three, SIZE, options);
    const folded = setSlotCollapsed(three, 'a', 'left');
    const after = computeTileLayout(folded, SIZE, options);
    expect(after.tiles.get('a')!.width).toBe(STRIP);
    expect(after.tiles.get('c')).toEqual(before.tiles.get('c'));
    expect(after.tiles.get('b')!.width).toBeCloseTo(before.tiles.get('a')!.width + before.tiles.get('b')!.width - STRIP);
    expect(after.slots.find((slot) => slot.collapsed)?.peekEdge).toBe('left');
  });

  it('reopens to exactly the layout it had', () => {
    const folded = setSlotCollapsed(three, 'a', 'left');
    const reopened = setSlotCollapsed(folded, 'a', null);
    expect(computeTileLayout(reopened, SIZE, options).tiles).toEqual(computeTileLayout(three, SIZE, options).tiles);
    expect(findSlot(reopened, 'a')!.slot.lastCollapseEdge).toBe('left');
  });

  it('refuses a collapse with no open neighbour to take the space', () => {
    expect(canCollapse(t('a'), 'a', 'left').allowed).toBe(false);
    expect(canCollapse(three, 'a', 'top').allowed).toBe(false);
    expect(canCollapse(three, 'c', 'left').allowed).toBe(false);
    expect(canCollapse(three, 'c', 'right').allowed).toBe(true);
    expect(setSlotCollapsed(three, 'c', 'left')).toBe(three);
  });

  it('a removed strip leaves its share with the slot that showed it', () => {
    const next = removeTile(setSlotCollapsed(three, 'a', 'left'), 'a') as TileSplit;
    expect(next).toEqual(row([2, 1], t('b'), t('c')));
  });

  it('docking onto a collapsed slot opens it first', () => {
    const next = dock(setSlotCollapsed(three, 'a', 'left'), 'c', 'a', 'bottom');
    expect(collapsed(next, 'a')).toBeUndefined();
  });

  it('resizing across a strip keeps the strip at its thickness', () => {
    const folded = setSlotCollapsed(three, 'b', 'left');
    const layout = computeTileLayout(folded, SIZE, options);
    const handle = layout.handles.find((entry) => entry.a === 0 && entry.b === 2)!;
    const next = computeTileLayout(folded, SIZE, { ...options, draft: { split: folded as TileSplit, sizes: resizedShares(handle, 20) } });
    expect(next.tiles.get('b')!.width).toBe(STRIP);
    expect(next.tiles.get('a')!.width).toBeCloseTo(layout.tiles.get('a')!.width + 20);
  });

  it('expands one slot alone, then collapses it alone again', () => {
    const alone = expandSlotAlone(three, 'b');
    expect([collapsed(alone, 'a'), collapsed(alone, 'b'), collapsed(alone, 'c')]).toEqual(['left', undefined, 'right']);
    expect(shareHolders(alone as TileSplit)).toEqual(new Map([[0, 1], [2, 1]]));
    const back = collapseSlotAlone(alone, 'b');
    expect([collapsed(back, 'a'), collapsed(back, 'c')]).toEqual([undefined, undefined]);
    expect(collapsed(back, 'b')).toBeDefined();
    expect(canCollapseAlone(t('a'), 'a').allowed).toBe(false);
  });

  it('normalizes collapse state: keeps valid edges, drops ones that cannot hold', () => {
    expect(normalize(row([1, 1], t('a', 'left'), t('b')))).toEqual(row([1, 1], t('a', 'left'), t('b')));
    // Off-axis, or every slot collapsed: the flags clear.
    expect(normalize(col([1, 1], t('a', 'left'), t('b')))).toEqual(col([1, 1], { ...t('a'), lastCollapseEdge: 'left' }, t('b')));
    expect(normalize({ kind: 'tile', id: 'a', collapsed: { edge: 'sideways' } })).toEqual(t('a'));
  });
});
