import { findSlot, MIN_SHARE_RATIO, replaceNode, slotKey, type CollapseEdge, type SplitDir, type TileNode, type TileSlot, type TileSplit } from './tileTree';

/**
 * Collapse folds a slot to a strip on its split's axis. `split.sizes[i]` is always slot i's own share;
 * a collapsed slot keeps its share as its come-back size while an open neighbour (its holder) shows that space.
 */

export type CollapsePermission = { allowed: true; reason?: never } | { allowed: false; reason: string };

const OPPOSITE: Record<CollapseEdge, CollapseEdge> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const OPEN_SIDE_STEP: Record<CollapseEdge, number> = { top: 1, bottom: -1, left: 1, right: -1 };
/** Edges whose space goes to a later or an earlier sibling. */
const TOWARD_LATER: Record<SplitDir, CollapseEdge> = { row: 'left', column: 'top' };
const TOWARD_EARLIER: Record<SplitDir, CollapseEdge> = { row: 'right', column: 'bottom' };

export const collapseAxis = (edge: CollapseEdge): SplitDir => (edge === 'left' || edge === 'right' ? 'row' : 'column');

/** The nearest open sibling on the slot's open side. */
export function collapseRecipient(split: TileSplit, index: number, edge: CollapseEdge, collapsed: ReadonlySet<number>): number | undefined {
  if (split.dir !== collapseAxis(edge)) return undefined;
  const step = OPEN_SIDE_STEP[edge];
  for (let i = index + step; i >= 0 && i < split.children.length; i += step) if (!collapsed.has(i)) return i;
  return undefined;
}

/** A collapse holds on its split's axis while one slot stays open; with none open, all expand. */
export function collapsedIndices(split: TileSplit): Set<number> {
  const collapsed = new Set<number>();
  split.children.forEach((child, i) => {
    if (child.kind !== 'split' && child.collapsed && collapseAxis(child.collapsed.edge) === split.dir) collapsed.add(i);
  });
  return collapsed.size < split.children.length ? collapsed : new Set();
}

/** Collapsed index → the open slot showing its space: nearest on its open side, else nearest on the other. */
export function shareHolders(split: TileSplit): Map<number, number> {
  const collapsed = collapsedIndices(split);
  const holders = new Map<number, number>();
  for (const i of collapsed) {
    const edge = (split.children[i] as TileSlot).collapsed!.edge;
    const holder = collapseRecipient(split, i, edge, collapsed) ?? collapseRecipient(split, i, OPPOSITE[edge], collapsed);
    if (holder !== undefined) holders.set(i, holder);
  }
  return holders;
}

/** Collapsed slots `holder` shows, nearest first. */
export function heldBy(split: TileSplit, holder: number, holders = shareHolders(split)): number[] {
  return [...holders].filter(([, h]) => h === holder).map(([i]) => i).sort((x, y) => Math.abs(x - holder) - Math.abs(y - holder) || x - y);
}

/** On-screen shares: an open slot adds the shares it holds; a collapsed slot keeps its come-back share. */
export function viewShares(split: TileSplit, holders = shareHolders(split)): number[] {
  const view = [...split.sizes];
  holders.forEach((holder, i) => { view[holder] += split.sizes[i]; });
  return view;
}

/** Inverse of `viewShares` for the same collapse state; a holder never drops below the share floor. */
export function ownShares(split: TileSplit, view: readonly number[], holders = shareHolders(split)): number[] {
  const own = [...view];
  holders.forEach((holder, i) => { own[holder] -= view[i]; });
  const floor = Math.max(...view) * MIN_SHARE_RATIO;
  return own.map((share) => Math.max(floor, share));
}

/** The edge a collapsed slot's content would open from: toward its holder. Null for an open slot. */
export function peekEdgeOf(split: TileSplit, index: number, holders = shareHolders(split)): CollapseEdge | null {
  const holder = holders.get(index);
  if (holder === undefined) return null;
  return holder > index ? TOWARD_LATER[split.dir] : TOWARD_EARLIER[split.dir];
}

/** Moves on-screen share from loser to gainer: the loser spends its own share to its floor, then the shares it holds, nearest first. */
export function tradeShares(split: TileSplit, gainer: number, loser: number, amount: number, floors: readonly number[]): number[] {
  const sizes = [...split.sizes];
  let owed = amount;
  for (const i of [loser, ...heldBy(split, loser)]) {
    const given = Math.min(owed, Math.max(0, sizes[i] - floors[i]));
    sizes[i] -= given;
    owed -= given;
  }
  sizes[gainer] += amount - owed;
  return sizes;
}

export function canCollapse(root: TileNode | undefined, id: string, edge: CollapseEdge): CollapsePermission {
  const location = findSlot(root, id);
  if (!location) return { allowed: false, reason: 'Tile not found' };
  const { parent, index } = location;
  if (!parent) return { allowed: false, reason: 'A lone tile has no neighbour to take its space' };
  if (parent.dir !== collapseAxis(edge)) return { allowed: false, reason: 'No neighbour on this axis' };
  const collapsed = collapsedIndices(parent);
  collapsed.add(index);
  if (collapseRecipient(parent, index, edge, collapsed) === undefined) return { allowed: false, reason: 'No open neighbour on that side can take its space' };
  return { allowed: true };
}

export function expandedSlot<T extends TileSlot>(slot: T): T {
  if (!slot.collapsed) return slot;
  const { collapsed, ...expanded } = slot;
  return { ...expanded, lastCollapseEdge: collapsed.edge } as T;
}

/** Reopening only clears the flag: every share is the slot's own, so nothing else moves. */
function reopen(split: TileSplit, index: number): TileSplit {
  const slot = split.children[index];
  if (slot.kind === 'split' || !slot.collapsed) return split;
  return { ...split, children: split.children.map((child, i) => (i === index ? expandedSlot(slot) : child)) };
}

/** Clears collapse flags that cannot hold: off-axis, every sibling collapsed, or a slot outside any split. */
export function repairCollapse(root: TileNode): TileNode {
  if (root.kind !== 'split') return expandedSlot(root);
  const collapsed = collapsedIndices(root);
  let split = root;
  root.children.forEach((child, i) => { if (child.kind !== 'split' && child.collapsed && !collapsed.has(i)) split = reopen(split, i); });
  const children = split.children.map((child) => (child.kind === 'split' ? repairCollapse(child) : child));
  return children.every((child, i) => child === split.children[i]) ? split : { ...split, children };
}

/** Collapses the slot holding `id` toward `edge`, or reopens it with `null`. */
export function setSlotCollapsed(root: TileNode, id: string, edge: CollapseEdge | null): TileNode {
  const location = findSlot(root, id);
  if (!location || (edge !== null && !canCollapse(root, id, edge).allowed)) return root;
  const { slot, parent, index } = location;
  if (edge === null) return !slot.collapsed ? root : parent ? replaceNode(root, parent, reopen(parent, index)) : expandedSlot(slot);
  if (slot.collapsed?.edge === edge) return root;
  return replaceNode(root, slot, { ...slot, collapsed: { edge } });
}

/** Opens one slot and rolls every sibling slot in its split toward it. Nested splits cannot roll, so they stay open. */
export function expandSlotAlone(root: TileNode, id: string): TileNode {
  const location = findSlot(root, id);
  if (!location?.parent) return root;
  const { parent, index } = location;
  const edgeFor = (i: number) => (i < index ? TOWARD_LATER[parent.dir] : TOWARD_EARLIER[parent.dir]);
  let next = setSlotCollapsed(root, id, null);
  parent.children.forEach((child, i) => {
    if (child.kind !== 'split' && i !== index && child.collapsed && child.collapsed.edge !== edgeFor(i)) next = setSlotCollapsed(next, slotKey(child), null);
  });
  parent.children.forEach((child, i) => {
    if (child.kind !== 'split' && i !== index) next = setSlotCollapsed(next, slotKey(child), edgeFor(i));
  });
  return next;
}

/** Opens every sibling slot in its split and collapses this one, on its remembered edge when allowed. */
export function collapseSlotAlone(root: TileNode, id: string): TileNode {
  const location = findSlot(root, id);
  if (!location?.parent) return root;
  const { parent, index, slot } = location;
  let opened = root;
  parent.children.forEach((child, i) => { if (child.kind !== 'split' && i !== index) opened = setSlotCollapsed(opened, slotKey(child), null); });
  const remembered = slot.collapsed?.edge ?? slot.lastCollapseEdge;
  const edge = [remembered, TOWARD_LATER[parent.dir], TOWARD_EARLIER[parent.dir]]
    .find((candidate) => candidate !== undefined && canCollapse(opened, id, candidate).allowed);
  return edge ? setSlotCollapsed(opened, id, edge) : root;
}

function alonePermission(root: TileNode | undefined, id: string, apply: typeof expandSlotAlone, unchanged: string): CollapsePermission {
  if (!root || !findSlot(root, id)?.parent) return { allowed: false, reason: 'A lone tile has no neighbour' };
  return apply(root, id) === root ? { allowed: false, reason: unchanged } : { allowed: true };
}

export const canExpandAlone = (root: TileNode | undefined, id: string) =>
  alonePermission(root, id, expandSlotAlone, 'Every neighbouring tile is already collapsed');
export const canCollapseAlone = (root: TileNode | undefined, id: string) =>
  alonePermission(root, id, collapseSlotAlone, 'This tile is collapsed and every neighbour is open');
