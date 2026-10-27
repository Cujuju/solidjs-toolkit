import {
  canonicalize, EVEN_SPLIT_PARTS, findSlot, findTile, isShare, nodeAt, replaceNode, splitAxis, tileIds, UNIT_SHARE,
  type DockSide, type DropZone, type InsertionShares, type TileLeaf, type TileNode, type TilePath, type TileSlot, type TileSplit,
} from './tileTree';

const finish = (root: TileNode): TileNode => canonicalize(root);
const atStart = (side: DockSide): boolean => side === 'left' || side === 'top';

function remove(node: TileNode, id: string): TileNode | undefined {
  if (node.kind === 'tile') return node.id === id ? undefined : node;
  if (node.kind === 'tabs') {
    const children = node.children.filter((child) => child.id !== id);
    if (children.length === node.children.length) return node;
    if (!children.length) return undefined;
    if (children.length === 1) return children[0];
    const activeId = node.children[node.active]?.id;
    const activeIndex = children.findIndex((child) => child.id === activeId);
    return { ...node, active: activeIndex >= 0 ? activeIndex : Math.min(node.active, children.length - 1), children };
  }
  const sizes = [...node.sizes];
  const kept = node.children.flatMap((child, i) => {
    const result = remove(child, id);
    return result ? [{ child: result, index: i }] : [];
  });
  if (!kept.length) return undefined;
  if (kept.length === 1) return kept[0].child;
  if (kept.length === node.children.length && kept.every((entry, i) => entry.child === node.children[i])) return node;
  return { ...node, children: kept.map((entry) => entry.child), sizes: kept.map((entry) => sizes[entry.index]) };
}

/** Removes a tile; its siblings share the freed space in proportion. A tab leaves its group. */
export function removeTile(root: TileNode | undefined, id: string): TileNode | undefined {
  const rest = root && remove(root, id);
  return rest && finish(rest);
}

const pair = (target: TileNode, moved: TileLeaf, side: DockSide, shares?: InsertionShares): TileSplit => {
  const [targetShare, movedShare] = shares ?? [UNIT_SHARE, UNIT_SHARE];
  return {
    kind: 'split', dir: splitAxis(side),
    sizes: atStart(side) ? [movedShare, targetShare] : [targetShare, movedShare],
    children: atStart(side) ? [moved, target] : [target, moved],
  };
};

/** Moves `movedId` (or adds it, when absent) beside the slot holding `targetId`, dividing that slot's share. */
export function dock(root: TileNode, movedId: string, targetId: string, side: DockSide, shares?: InsertionShares): TileNode {
  const source = findSlot(root, movedId)?.slot;
  // A tab docks beside its own group: the group stays, addressed by another of its tabs.
  if (movedId === targetId && source?.kind === 'tabs') targetId = source.children.find((child) => child.id !== movedId)!.id;
  if (movedId === targetId || !findSlot(root, targetId)) return root;
  const moved: TileLeaf = { kind: 'tile', id: movedId };
  const rest = remove(root, movedId);
  const location = rest && findSlot(rest, targetId);
  if (!rest || !location) return root;
  const { slot, parent, index } = location;
  if (!parent || parent.dir !== splitAxis(side)) return finish(replaceNode(rest, slot, pair(slot, moved, side, shares)));
  const sizes = [...parent.sizes];
  const children = [...parent.children];
  const half = sizes[index] / EVEN_SPLIT_PARTS;
  sizes[index] = shares?.[0] ?? half;
  const insertAt = atStart(side) ? index : index + 1;
  sizes.splice(insertAt, 0, shares?.[1] ?? half);
  children.splice(insertAt, 0, moved);
  return finish(replaceNode(rest, parent, { ...parent, sizes, children }));
}

function insertTab(root: TileNode, movedId: string, targetId: string): TileNode {
  const slot = findSlot(root, targetId)?.slot;
  if (!slot) return root;
  const moved: TileLeaf = { kind: 'tile', id: movedId };
  const replacement: TileSlot = slot.kind === 'tabs'
    ? { ...slot, active: slot.children.length, children: [...slot.children, moved] }
    : { kind: 'tabs', active: 1, children: [{ kind: 'tile', id: slot.id }, moved] };
  return finish(replaceNode(root, slot, replacement));
}

/** Moves `movedId` into the slot holding `targetId` as its last, active tab. */
export function addToTabs(root: TileNode, movedId: string, targetId: string): TileNode {
  const source = findSlot(root, movedId);
  const target = findSlot(root, targetId);
  if (!source || !target || source.slot === target.slot) return root;
  const rest = remove(root, movedId);
  return rest ? insertTab(rest, movedId, targetId) : root;
}

/** Adds a new tile beside `targetId`, or as a tab on it (`center`); an existing id or invalid shares change nothing. */
export function insertTile(root: TileNode, id: string, targetId: string, zone: DropZone, shares?: InsertionShares): TileNode {
  if (!findSlot(root, targetId) || findSlot(root, id) || (shares && (shares.length !== EVEN_SPLIT_PARTS || !shares.every(isShare)))) return root;
  return zone === 'center' ? insertTab(root, id, targetId) : dock(root, id, targetId, zone, shares);
}

/** Exchanges two tiles' places; geometry and tab order stay put. */
export function swapTiles(root: TileNode, a: string, b: string): TileNode {
  if (a === b || !findTile(root, a) || !findTile(root, b)) return root;
  const rename = (leaf: TileLeaf): TileLeaf => (leaf.id === a ? { ...leaf, id: b } : leaf.id === b ? { ...leaf, id: a } : leaf);
  function visit(node: TileNode): TileNode {
    if (node.kind === 'tile') return rename(node);
    if (node.kind === 'tabs') return { ...node, children: node.children.map(rename) };
    return { ...node, children: node.children.map(visit) };
  }
  return visit(root);
}

/** Moves a tab to `toIndex` within its own group; the same tab stays active. */
export function moveTab(root: TileNode, id: string, toIndex: number): TileNode {
  const slot = findSlot(root, id)?.slot;
  if (slot?.kind !== 'tabs' || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= slot.children.length) return root;
  const from = slot.children.findIndex((child) => child.id === id);
  if (from === toIndex) return root;
  const activeId = slot.children[slot.active].id;
  const children = slot.children.filter((child) => child.id !== id);
  children.splice(toIndex, 0, slot.children[from]);
  return finish(replaceNode(root, slot, { ...slot, active: children.findIndex((child) => child.id === activeId), children }));
}

/** Shows tab `active` of the group holding `id`. */
export function setActiveTab(root: TileNode, id: string, active: number): TileNode {
  const slot = findSlot(root, id)?.slot;
  if (slot?.kind !== 'tabs' || !Number.isInteger(active) || active < 0 || active >= slot.children.length || active === slot.active) return root;
  return finish(replaceNode(root, slot, { ...slot, active }));
}

export function resizeSplit(root: TileNode, path: TilePath, sizes: readonly number[]): TileNode {
  const split = nodeAt(root, path);
  if (split?.kind !== 'split' || sizes.length !== split.children.length || !sizes.every(isShare)) return root;
  if (sizes.every((size, i) => size === split.sizes[i])) return root;
  return finish(replaceNode(root, split, { ...split, sizes: [...sizes] }));
}

/** Adds a tile at the right edge of the whole workspace with an average share. */
export function appendTile(root: TileNode | undefined, id: string): TileNode {
  const leaf: TileLeaf = { kind: 'tile', id };
  if (!root) return leaf;
  if (tileIds(root).includes(id)) return root;
  if (root.kind !== 'split' || root.dir !== 'row') return finish(pair(root, leaf, 'right'));
  const mean = root.sizes.reduce((sum, share) => sum + share, 0) / root.sizes.length;
  return finish({ ...root, sizes: [...root.sizes, mean], children: [...root.children, leaf] });
}
