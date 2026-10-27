import { repairCollapse } from './tileCollapse';
import { canonicalize, isShare, repairShares, UNIT_SHARE, type CollapseEdge, type TileLeaf, type TileNode, type TileSlot } from './tileTree';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const EDGES: readonly unknown[] = ['left', 'right', 'top', 'bottom'] satisfies CollapseEdge[];
const isEdge = (value: unknown): value is CollapseEdge => EDGES.includes(value);

function slotState(node: Record<string, unknown>): Pick<TileSlot, 'collapsed' | 'lastCollapseEdge'> {
  return {
    ...(record(node.collapsed) && isEdge(node.collapsed.edge) ? { collapsed: { edge: node.collapsed.edge } } : {}),
    ...(isEdge(node.lastCollapseEdge) ? { lastCollapseEdge: node.lastCollapseEdge } : {}),
  };
}

/** Reads a saved tree: drops invalid nodes, duplicate ids and ids outside `ids`, and repairs shares and tab groups. */
export function normalize(value: unknown, ids?: ReadonlySet<string>): TileNode | undefined {
  const seen = new Set<string>();
  const leaf = (node: Record<string, unknown>): TileLeaf | undefined => {
    const id = node.id;
    if (typeof id !== 'string' || !id || seen.has(id) || (ids && !ids.has(id))) return undefined;
    seen.add(id);
    return { kind: 'tile', id };
  };
  function visit(node: unknown): TileNode | undefined {
    if (!record(node)) return undefined;
    if (node.kind === 'tile') { const tile = leaf(node); return tile && { ...tile, ...slotState(node) }; }
    if (!Array.isArray(node.children)) return undefined;
    if (node.kind === 'tabs') {
      const activeChild = node.children[Number(node.active)];
      const activeId = record(activeChild) ? activeChild.id : undefined;
      const children = node.children.flatMap((child) => {
        const tab = record(child) && child.kind === 'tile' ? leaf(child) : undefined;
        return tab ? [tab] : [];
      });
      if (!children.length) return undefined;
      if (children.length === 1) return { ...children[0], ...slotState(node) };
      return { kind: 'tabs', active: Math.max(0, children.findIndex((child) => child.id === activeId)), children, ...slotState(node) };
    }
    if (node.kind !== 'split' || (node.dir !== 'row' && node.dir !== 'column')) return undefined;
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
  return root ? repairCollapse(canonicalize(root)) : undefined;
}
