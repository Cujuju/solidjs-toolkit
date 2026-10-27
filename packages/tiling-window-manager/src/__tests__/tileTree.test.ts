import { describe, expect, it } from 'vitest';
import {
  canonicalize, dropZoneAt, findTile, tileIds,
  type TileNode, type TileSplit,
} from '../tileTree';
import { appendTile, dock, insertTile, removeTile, resizeSplit, swapTiles } from '../tileEdits';
import { normalize } from '../tileRepair';

const t = (id: string): TileNode => ({ kind: 'tile', id });
const row = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'row', sizes, children });
const col = (sizes: number[], ...children: TileNode[]): TileSplit => ({ kind: 'split', dir: 'column', sizes, children });

describe('tile tree', () => {
  it('docks beside a target, dividing only its share', () => {
    const root = row([1, 1], t('a'), t('b'));
    expect(dock(root, 'c', 'b', 'right')).toEqual(row([1, 0.5, 0.5], t('a'), t('b'), t('c')));
    expect(dock(root, 'c', 'a', 'top')).toEqual(row([1, 1], col([1, 1], t('c'), t('a')), t('b')));
  });

  it('moves an existing tile instead of duplicating it', () => {
    const root = row([1, 1, 1], t('a'), t('b'), t('c'));
    const next = dock(root, 'a', 'c', 'bottom');
    expect(tileIds(next)).toEqual(['b', 'c', 'a']);
    expect(findTile(next, 'a')?.parent?.dir).toBe('column');
  });

  it('removes a tile and collapses a one-child split', () => {
    const root = row([1, 1], col([1, 1], t('a'), t('b')), t('c'));
    expect(removeTile(root, 'a')).toEqual(row([1, 1], t('b'), t('c')));
    expect(removeTile(t('a'), 'a')).toBeUndefined();
  });

  it('flattens same-direction nesting in proportion', () => {
    expect(canonicalize(row([2, 1], row([1, 3], t('a'), t('b')), t('c')))).toEqual(row([0.5, 1.5, 1], t('a'), t('b'), t('c')));
  });

  it('inserts with explicit shares and refuses an existing id', () => {
    const root = row([1, 1], t('a'), t('b'));
    expect(insertTile(root, 'c', 'a', 'left', [0.6, 0.4])).toEqual(row([0.4, 0.6, 1], t('c'), t('a'), t('b')));
    expect(insertTile(root, 'b', 'a', 'left')).toBe(root);
  });

  it('swaps places and resizes a split by path', () => {
    const root = row([1, 1], t('a'), col([1, 1], t('b'), t('c')));
    expect(tileIds(swapTiles(root, 'a', 'c'))).toEqual(['c', 'b', 'a']);
    expect((resizeSplit(root, [1], [3, 1]) as TileSplit).children[1]).toEqual(col([3, 1], t('b'), t('c')));
    expect(resizeSplit(root, [1], [0, 1])).toBe(root);
  });

  it('appends to the right edge with an average share', () => {
    expect(appendTile(undefined, 'a')).toEqual(t('a'));
    expect(appendTile(row([1, 3], t('a'), t('b')), 'c')).toEqual(row([1, 3, 2], t('a'), t('b'), t('c')));
  });

  it('normalizes saved trees: invalid nodes, duplicates and unknown ids drop out', () => {
    const saved = { kind: 'split', dir: 'row', sizes: [2, 'x', 4], children: [t('a'), t('a'), { kind: 'tile', id: 'gone' }, 7] };
    expect(normalize(saved, new Set(['a']))).toEqual(t('a'));
    expect(normalize(row([2, 4], t('a'), t('b')), new Set(['a', 'b']))).toEqual(row([0.5, 1], t('a'), t('b')));
    expect(normalize('nope')).toBeUndefined();
  });

  it('picks an edge zone near an edge and the centre elsewhere', () => {
    const all = ['left', 'right', 'top', 'bottom', 'center'] as const;
    expect(dropZoneAt(all, 0.05, 0.5)).toBe('left');
    expect(dropZoneAt(all, 0.5, 0.95)).toBe('bottom');
    expect(dropZoneAt(all, 0.5, 0.5)).toBe('center');
    expect(dropZoneAt(['left', 'right', 'top', 'bottom'], 0.5, 0.45)).toBe('top');
  });
});
