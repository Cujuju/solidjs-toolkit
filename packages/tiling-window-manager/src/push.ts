import { computeTileLayout, minimumSize, type TileLayout, type TileLayoutOptions, type TileSize } from './layout';
import type { TileNode, TilePath, TileSplit } from './tileTree';

/** One arrow press moves a pushing divider this far. */
export const PUSH_KEY_STEP_PX = 10;

/** What a pushing drag moves: the divider after child `gap` of the column split at `path`, or the workspace's bottom edge. */
export type PushTarget = { path: TilePath; gap: number } | 'bottom';

/** The tree with each touched column split's shares set to its children's pixel heights, and the workspace's new height. */
export interface PushedLayout { root: TileNode; heightPx: number }

type Options = Pick<TileLayoutOptions, 'gapPx' | 'minSizes'>;

/** Every column split's child heights on screen. */
function columnHeights(layout: TileLayout): Map<TileSplit, number[]> {
  const heights = new Map<TileSplit, number[]>();
  for (const handle of layout.handles) {
    if (handle.split.dir === 'column') heights.set(handle.split, handle.childRects.map((rect) => rect.height));
  }
  return heights;
}

/**
 * Pixels the node's bottom edge can rise before a tile on that edge reaches its minimum.
 * Only tiles touching the edge give way, so the tiles above them never move.
 */
function bottomSlack(node: TileNode, height: number, heights: Map<TileSplit, number[]>, options: Options): number {
  if (node.kind !== 'split') return height - minimumSize(node, options).height;
  if (node.dir === 'row') return Math.min(...node.children.map((child) => bottomSlack(child, height, heights, options)));
  const last = node.children.length - 1;
  return bottomSlack(node.children[last], heights.get(node)![last], heights, options);
}

/** The node grown `delta` at its bottom edge: the tiles touching that edge take it, the rest keep their pixels. */
function growBottom(node: TileNode, height: number, delta: number, heights: Map<TileSplit, number[]>): TileNode {
  if (node.kind !== 'split') return node;
  if (node.dir === 'row') return { ...node, children: node.children.map((child) => growBottom(child, height, delta, heights)) };
  const px = heights.get(node)!;
  const last = node.children.length - 1;
  return {
    ...node,
    sizes: px.map((h, i) => (i === last ? h + delta : h)),
    children: node.children.map((child, i) => (i === last ? growBottom(child, px[i], delta, heights) : child)),
  };
}

/**
 * Moves a horizontal divider or the bottom edge `deltaPx`: the tile above it grows or shrinks and everything below
 * shifts, so the workspace's height changes by the same amount. Tiles beside the moved one in a row follow at their
 * own bottom edge. Shrinking stops at the first minimum. Collapsed slots are not supported.
 * The workspace never ends shorter than `floorPx`: the tiles on its bottom edge take up the difference, so a shrink
 * at the floor trades height with the bottom row instead.
 */
export function pushedLayout(
  root: TileNode, layout: TileLayout, size: TileSize, target: PushTarget, deltaPx: number, options: Options, floorPx = 0,
): PushedLayout {
  const pushed = push(root, layout, size.height, target, deltaPx, options);
  const deficit = floorPx - pushed.heightPx;
  if (deficit <= 0) return pushed;
  const after = computeTileLayout(pushed.root, { width: size.width, height: pushed.heightPx }, options);
  return { root: growBottom(pushed.root, pushed.heightPx, deficit, columnHeights(after)), heightPx: floorPx };
}

function push(root: TileNode, layout: TileLayout, heightPx: number, target: PushTarget, deltaPx: number, options: Options): PushedLayout {
  const heights = columnHeights(layout);
  if (target === 'bottom') {
    const delta = Math.round(Math.max(deltaPx, -Math.max(0, bottomSlack(root, heightPx, heights, options))));
    return { root: delta ? growBottom(root, heightPx, delta, heights) : root, heightPx: heightPx + delta };
  }
  // Every tile that moves its bottom edge: the one above the divider, and row neighbours along the way up.
  let slack = Infinity;
  const measure = (node: TileNode, height: number, depth: number) => {
    if (node.kind !== 'split') return;
    if (depth === target.path.length) {
      slack = Math.min(slack, bottomSlack(node.children[target.gap], heights.get(node)![target.gap], heights, options));
      return;
    }
    const index = target.path[depth];
    node.children.forEach((child, i) => {
      const childHeight = node.dir === 'row' ? height : heights.get(node)![i];
      if (i === index) measure(child, childHeight, depth + 1);
      else if (node.dir === 'row') slack = Math.min(slack, bottomSlack(child, childHeight, heights, options));
    });
  };
  measure(root, heightPx, 0);
  const delta = Math.round(Math.max(deltaPx, -Math.max(0, slack)));
  if (!delta) return { root, heightPx };

  const push = (node: TileNode, height: number, depth: number): TileNode => {
    if (node.kind !== 'split') return node;
    const index = depth === target.path.length ? target.gap : target.path[depth];
    const grow = (child: TileNode, childHeight: number) =>
      (depth === target.path.length ? growBottom(child, childHeight, delta, heights) : push(child, childHeight, depth + 1));
    if (node.dir === 'row') {
      return { ...node, children: node.children.map((child, i) => (i === index ? grow(child, height) : growBottom(child, height, delta, heights))) };
    }
    const px = heights.get(node)!;
    return {
      ...node,
      sizes: px.map((h, i) => (i === index ? h + delta : h)),
      children: node.children.map((child, i) => (i === index ? grow(child, px[i]) : child)),
    };
  };
  return { root: push(root, heightPx, 0), heightPx: heightPx + delta };
}
