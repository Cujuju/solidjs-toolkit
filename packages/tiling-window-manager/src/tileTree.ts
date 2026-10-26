/**
 * The tile tree: splits divide space between children by share; leaves are tiles.
 * Every edit returns a new canonical tree (no same-direction nesting, valid shares) and never mutates.
 */

export type SplitDir = 'row' | 'column';
export interface TileLeaf { kind: 'tile'; id: string }
export interface TileSplit {
  kind: 'split';
  dir: SplitDir;
  /** One positive share per child; only ratios matter. */
  sizes: number[];
  children: TileNode[];
}
export type TileNode = TileSplit | TileLeaf;
export type TilePath = readonly number[];

export type DockSide = 'left' | 'right' | 'top' | 'bottom';
/** `center` targets the tile itself: a moved tile swaps places with it. */
export type DropZone = DockSide | 'center';
export type InsertionShares = readonly [target: number, inserted: number];

export const UNIT_SHARE = 1;
export const EVEN_SPLIT_PARTS = 2;
/** A split with fewer children is replaced by its only child. */
export const MIN_SPLIT_CHILDREN = 2;
/** Prevents denormal ratios from making a saved tile effectively invisible. */
export const MIN_SHARE_RATIO = 0.000001;
/** Fraction of a tile's width or height from an edge that counts as that edge; the rest is the centre. */
export const DOCK_EDGE_SHARE = 0.25;

export interface TileLocation {
  leaf: TileLeaf;
  path: number[];
  parent: TileSplit | undefined;
  index: number;
}

export const isShare = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export const splitAxis = (side: DockSide): SplitDir => (side === 'left' || side === 'right' ? 'row' : 'column');
const atStart = (side: DockSide): boolean => side === 'left' || side === 'top';

export function tileIds(root: TileNode | undefined): string[] {
  if (!root) return [];
  return root.kind === 'tile' ? [root.id] : root.children.flatMap(tileIds);
}

export function findTile(root: TileNode | undefined, id: string): TileLocation | undefined {
  function visit(node: TileNode, path: number[], parent?: TileSplit, index = 0): TileLocation | undefined {
    if (node.kind === 'tile') return node.id === id ? { leaf: node, path, parent, index } : undefined;
    for (const [i, child] of node.children.entries()) {
      const found = visit(child, [...path, i], node, i);
      if (found) return found;
    }
    return undefined;
  }
  return root ? visit(root, []) : undefined;
}

export function nodeAt(root: TileNode, path: TilePath): TileNode | undefined {
  let node: TileNode | undefined = root;
  for (const i of path) node = node?.kind === 'split' ? node.children[i] : undefined;
  return node;
}

export function replaceNode(root: TileNode, target: TileNode, replacement: TileNode): TileNode {
  if (root === target) return replacement;
  if (root.kind !== 'split') return root;
  const children = root.children.map((child) => replaceNode(child, target, replacement));
  return children.every((child, i) => child === root.children[i]) ? root : { ...root, children };
}

/** Scales shares so the largest is 1 and none falls below the ratio floor. */
export function repairShares(sizes: readonly number[]): number[] {
  const max = Math.max(...sizes);
  return sizes.map((share) => Math.max(MIN_SHARE_RATIO, share / max));
}

/** Flattens same-direction nesting; a nested split's children take its share in proportion. */
export function canonicalize(root: TileNode): TileNode {
  if (root.kind !== 'split') return root;
  const children: TileNode[] = [];
  const sizes: number[] = [];
  root.children.forEach((entry, i) => {
    const child = canonicalize(entry);
    if (child.kind === 'split' && child.dir === root.dir) {
      const total = child.sizes.reduce((sum, share) => sum + share, 0);
      child.children.forEach((grandchild, j) => {
        children.push(grandchild);
        sizes.push(root.sizes[i] * (child.sizes[j] / total));
      });
    } else {
      children.push(child);
      sizes.push(root.sizes[i]);
    }
  });
  if (children.length === 1) return children[0];
  const max = Math.max(...sizes);
  const unsafe = !Number.isFinite(sizes.reduce((sum, share) => sum + share, 0)) || sizes.some((share) => share / max < MIN_SHARE_RATIO);
  const nextSizes = unsafe ? repairShares(sizes) : sizes;
  if (children.length === root.children.length && children.every((child, i) => child === root.children[i])
    && nextSizes.every((share, i) => share === root.sizes[i])) return root;
  return { ...root, children, sizes: nextSizes };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

/** Reads a saved tree: drops invalid nodes, duplicate ids and ids outside `ids`, and repairs shares. */
export function normalize(value: unknown, ids?: ReadonlySet<string>): TileNode | undefined {
  const seen = new Set<string>();
  function visit(node: unknown): TileNode | undefined {
    if (!record(node)) return undefined;
    if (node.kind === 'tile') {
      const id = node.id;
      if (typeof id !== 'string' || !id || seen.has(id) || (ids && !ids.has(id))) return undefined;
      seen.add(id);
      return { kind: 'tile', id };
    }
    if (node.kind !== 'split' || (node.dir !== 'row' && node.dir !== 'column') || !Array.isArray(node.children)) return undefined;
    const sizes = Array.isArray(node.sizes) ? node.sizes : [];
    const kept = node.children.flatMap((child, i) => {
      const result = visit(child);
      return result ? [{ child: result, size: isShare(sizes[i]) ? sizes[i] : UNIT_SHARE }] : [];
    });
    if (!kept.length) return undefined;
    if (kept.length === 1) return kept[0].child;
    return { kind: 'split', dir: node.dir, sizes: repairShares(kept.map((entry) => entry.size)), children: kept.map((entry) => entry.child) };
  }
  const root = visit(value);
  return root ? canonicalize(root) : undefined;
}

/** The zone a point falls in, as fractions (0–1) of the tile's width and height. */
export function dropZoneAt(allowed: readonly DropZone[], x: number, y: number): DropZone | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const distance: Record<DockSide, number> = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  const nearest = allowed.reduce<DockSide | null>((best, zone) =>
    zone === 'center' || (best !== null && distance[best] <= distance[zone]) ? best : zone, null);
  if (allowed.includes('center') && (nearest === null || distance[nearest] >= DOCK_EDGE_SHARE)) return 'center';
  return nearest;
}

function remove(node: TileNode, id: string): TileNode | undefined {
  if (node.kind === 'tile') return node.id === id ? undefined : node;
  const kept = node.children.flatMap((child, i) => {
    const result = remove(child, id);
    return result ? [{ child: result, size: node.sizes[i] }] : [];
  });
  if (!kept.length) return undefined;
  if (kept.length === 1) return kept[0].child;
  if (kept.length === node.children.length && kept.every((entry, i) => entry.child === node.children[i])) return node;
  return { ...node, children: kept.map((entry) => entry.child), sizes: kept.map((entry) => entry.size) };
}

/** Removes a tile; its siblings share the freed space in proportion. */
export function removeTile(root: TileNode | undefined, id: string): TileNode | undefined {
  const rest = root && remove(root, id);
  return rest && canonicalize(rest);
}

/** Moves `movedId` (or adds it, when absent) beside `targetId`, dividing the target's own share. */
export function dock(root: TileNode, movedId: string, targetId: string, side: DockSide, shares?: InsertionShares): TileNode {
  if (movedId === targetId || !findTile(root, targetId)) return root;
  const moved: TileLeaf = { kind: 'tile', id: movedId };
  const rest = remove(root, movedId);
  const location = rest && findTile(rest, targetId);
  if (!rest || !location) return root;
  const { leaf, parent, index } = location;
  const dir = splitAxis(side);
  const [targetShare, movedShare] = shares ?? [UNIT_SHARE, UNIT_SHARE];
  if (!parent || parent.dir !== dir) {
    const pair: TileSplit = { kind: 'split', dir, sizes: atStart(side) ? [movedShare, targetShare] : [targetShare, movedShare],
      children: atStart(side) ? [moved, leaf] : [leaf, moved] };
    return canonicalize(replaceNode(rest, leaf, pair));
  }
  const sizes = [...parent.sizes];
  const children = [...parent.children];
  const half = sizes[index] / EVEN_SPLIT_PARTS;
  sizes[index] = shares?.[0] ?? half;
  const insertAt = atStart(side) ? index : index + 1;
  sizes.splice(insertAt, 0, shares?.[1] ?? half);
  children.splice(insertAt, 0, moved);
  return canonicalize(replaceNode(rest, parent, { ...parent, sizes, children }));
}

/** Adds a new tile beside `targetId`; an existing id or invalid shares leave the tree unchanged. */
export function insertTile(root: TileNode, id: string, targetId: string, side: DockSide, shares?: InsertionShares): TileNode {
  if (findTile(root, id) || (shares && !shares.every(isShare))) return root;
  return dock(root, id, targetId, side, shares);
}

/** Exchanges two tiles' places; geometry stays put. */
export function swapTiles(root: TileNode, a: string, b: string): TileNode {
  if (a === b || !findTile(root, a) || !findTile(root, b)) return root;
  function visit(node: TileNode): TileNode {
    if (node.kind === 'tile') return node.id === a ? { kind: 'tile', id: b } : node.id === b ? { kind: 'tile', id: a } : node;
    return { ...node, children: node.children.map(visit) };
  }
  return visit(root);
}

export function resizeSplit(root: TileNode, path: TilePath, sizes: readonly number[]): TileNode {
  const split = nodeAt(root, path);
  if (split?.kind !== 'split' || sizes.length !== split.children.length || !sizes.every(isShare)) return root;
  if (sizes.every((size, i) => size === split.sizes[i])) return root;
  return canonicalize(replaceNode(root, split, { ...split, sizes: [...sizes] }));
}

/** Adds a tile at the right edge of the whole workspace with an average share. */
export function appendTile(root: TileNode | undefined, id: string): TileNode {
  const leaf: TileLeaf = { kind: 'tile', id };
  if (!root) return leaf;
  if (findTile(root, id)) return root;
  if (root.kind !== 'split' || root.dir !== 'row') return { kind: 'split', dir: 'row', sizes: [UNIT_SHARE, UNIT_SHARE], children: [root, leaf] };
  const mean = root.sizes.reduce((sum, share) => sum + share, 0) / root.sizes.length;
  return { ...root, sizes: [...root.sizes, mean], children: [...root.children, leaf] };
}
