/**
 * The tile tree: splits divide space between children by share; slots are a tile or a tab group.
 * Every edit returns a new canonical tree (no same-direction nesting, valid shares) and never mutates.
 */

export type SplitDir = 'row' | 'column';
export type DockSide = 'left' | 'right' | 'top' | 'bottom';
/** `center` targets the slot itself: a moved tile swaps with it or joins it as a tab. */
export type DropZone = DockSide | 'center';
export type InsertionShares = readonly [target: number, inserted: number];

export interface TileLeaf { kind: 'tile'; id: string }
/** Tiles sharing one slot; only the `active` one shows. */
export interface TileTabs { kind: 'tabs'; active: number; children: TileLeaf[] }
export type TileSlot = TileLeaf | TileTabs;
export interface TileSplit {
  kind: 'split';
  dir: SplitDir;
  /** One positive share per child; only ratios matter. */
  sizes: number[];
  children: TileNode[];
}
export type TileNode = TileSplit | TileSlot;
export type TilePath = readonly number[];

export const UNIT_SHARE = 1;
export const EVEN_SPLIT_PARTS = 2;
/** A split or tab group with fewer children is replaced by its only child. */
export const MIN_GROUP_CHILDREN = 2;
/** Prevents denormal ratios from making a saved tile effectively invisible. */
export const MIN_SHARE_RATIO = 0.000001;
/** Fraction of a tile's width or height from an edge that counts as that edge; the rest is the centre. */
export const DOCK_EDGE_SHARE = 0.25;

export interface SlotLocation {
  slot: TileSlot;
  path: number[];
  parent: TileSplit | undefined;
  index: number;
}
/** `leaf` is the tile itself; `slot` is the tile or the tab group holding it. */
export interface TileLocation extends SlotLocation { leaf: TileLeaf }

export const isShare = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export const splitAxis = (side: DockSide): SplitDir => (side === 'left' || side === 'right' ? 'row' : 'column');

export function tileIds(root: TileNode | undefined): string[] {
  if (!root) return [];
  return root.kind === 'tile' ? [root.id] : root.children.flatMap(tileIds);
}

/** The id that addresses a slot: the tile's, or the active tab's. */
export const slotKey = (slot: TileSlot): string => (slot.kind === 'tile' ? slot.id : slot.children[slot.active].id);
/** Every tile in a slot. */
export const slotIds = (slot: TileSlot): string[] => (slot.kind === 'tile' ? [slot.id] : slot.children.map((child) => child.id));

/** Any tab's id addresses its tab group. */
export function findSlot(root: TileNode | undefined, id: string): SlotLocation | undefined {
  function visit(node: TileNode, path: number[], parent?: TileSplit, index = 0): SlotLocation | undefined {
    if (node.kind !== 'split') return slotIds(node).includes(id) ? { slot: node, path, parent, index } : undefined;
    for (const [i, child] of node.children.entries()) {
      const found = visit(child, [...path, i], node, i);
      if (found) return found;
    }
    return undefined;
  }
  return root ? visit(root, []) : undefined;
}

export function findTile(root: TileNode | undefined, id: string): TileLocation | undefined {
  const location = findSlot(root, id);
  if (!location) return undefined;
  const { slot } = location;
  const leaf = slot.kind === 'tile' ? slot : slot.children.find((child) => child.id === id)!;
  return { ...location, leaf };
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
      const ratios = repairShares(child.sizes);
      const total = ratios.reduce((sum, share) => sum + share, 0);
      child.children.forEach((grandchild, j) => {
        children.push(grandchild);
        sizes.push(root.sizes[i] * (ratios[j] / total));
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

/** The zone a point falls in, as fractions (0–1) of the tile's width and height. */
export function dropZoneAt(allowed: readonly DropZone[], x: number, y: number): DropZone | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const distance: Record<DockSide, number> = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  const nearest = allowed.reduce<DockSide | null>((best, zone) =>
    zone === 'center' || (best !== null && distance[best] <= distance[zone]) ? best : zone, null);
  if (allowed.includes('center') && (nearest === null || distance[nearest] >= DOCK_EDGE_SHARE)) return 'center';
  return nearest;
}
