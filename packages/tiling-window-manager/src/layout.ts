import { EVEN_SPLIT_PARTS, MIN_SHARE_RATIO, slotIds, slotKey, type TileNode, type TileSlot, type TileSplit } from './tileTree';

export interface TileSize { width: number; height: number }
export interface LayoutRect extends TileSize { x: number; y: number }

export interface LayoutHandle {
  /** Stable while the tree keeps its shape: `<split path>:<gap index>`. */
  key: string;
  path: number[];
  split: TileSplit;
  /** Shares a drag starts from: the stored ones, or ones matching the pixels when minimums clamped them. */
  sizes: number[];
  /** The two children either side of the divider. */
  a: number;
  b: number;
  rect: LayoutRect;
  childRects: LayoutRect[];
  /** Pixels the split's shares divide (its length minus its gaps). */
  shareSpacePx: number;
  /** Each child's minimum along the split axis. */
  minimums: number[];
}

export interface TileLayoutOptions {
  gapPx: number;
  minSizes: ReadonlyMap<string, TileSize>;
  /** Shares of one split under a live drag, shown before they are committed. */
  draft?: { split: TileSplit; sizes: number[] } | null;
}

/** One tile or tab group and its box. */
export interface LayoutSlot { slot: TileSlot; rect: LayoutRect }

export interface TileLayout {
  /** Every tile's box; tabs of one group share their group's. */
  tiles: Map<string, LayoutRect>;
  slots: LayoutSlot[];
  handles: LayoutHandle[];
  splitSpaces: Map<TileSplit, { shareSpacePx: number; totalShare: number }>;
}

const axisOf = (split: TileSplit) => (split.dir === 'row' ? 'width' : 'height');

/** Splits `space` by share, never below a minimum; when the minimums alone overflow, they shrink in proportion. */
function distribute(shares: readonly number[], minima: readonly number[], space: number): { px: number[]; clamped: boolean } {
  const minimumTotal = minima.reduce((sum, min) => sum + min, 0);
  if (minimumTotal >= space && minimumTotal > 0) return { px: minima.map((min) => space * min / minimumTotal), clamped: true };
  const px = shares.map(() => 0);
  const pending = new Set(shares.map((_, i) => i));
  let remaining = space;
  while (pending.size) {
    const total = [...pending].reduce((sum, i) => sum + shares[i], 0);
    const clamped = [...pending].filter((i) => remaining * shares[i] / total < minima[i]);
    if (!clamped.length) {
      for (const i of pending) px[i] = remaining * shares[i] / total;
      break;
    }
    for (const i of clamped) { px[i] = minima[i]; remaining -= minima[i]; pending.delete(i); }
  }
  return { px, clamped: remaining !== space };
}

/** The node's smallest size: tile minimums plus gaps along each split. */
export function minimumSize(node: TileNode, options: Pick<TileLayoutOptions, 'gapPx' | 'minSizes'>): TileSize {
  if (node.kind === 'tile') return options.minSizes.get(node.id) ?? { width: 0, height: 0 };
  if (node.kind === 'tabs') {
    const tabs = node.children.map((child) => minimumSize(child, options));
    return { width: Math.max(...tabs.map((min) => min.width)), height: Math.max(...tabs.map((min) => min.height)) };
  }
  const mins = node.children.map((child) => minimumSize(child, options));
  const sum = (key: keyof TileSize) => mins.reduce((total, min) => total + min[key], 0) + options.gapPx * (mins.length - 1);
  const max = (key: keyof TileSize) => Math.max(...mins.map((min) => min[key]));
  return node.dir === 'row' ? { width: sum('width'), height: max('height') } : { width: max('width'), height: sum('height') };
}

/** Slot boxes keyed by the id that addresses each slot (a group's active tab): the drop targets. */
export const slotRects = (layout: Pick<TileLayout, 'slots'>): Map<string, LayoutRect> =>
  new Map(layout.slots.map((entry) => [slotKey(entry.slot), entry.rect]));

/** One geometry source for tiles, dividers, drop previews and placement planning. */
export function computeTileLayout(root: TileNode | undefined, size: TileSize, options: TileLayoutOptions): TileLayout {
  const tiles = new Map<string, LayoutRect>();
  const slots: LayoutSlot[] = [];
  const handles: LayoutHandle[] = [];
  const splitSpaces = new Map<TileSplit, { shareSpacePx: number; totalShare: number }>();
  function visit(node: TileNode, rect: LayoutRect, path: number[]) {
    if (node.kind !== 'split') {
      slots.push({ slot: node, rect });
      slotIds(node).forEach((id) => tiles.set(id, rect));
      return;
    }
    const split = options.draft?.split === node ? { ...node, sizes: options.draft.sizes } : node;
    const horizontal = split.dir === 'row';
    const axis = axisOf(split);
    const start = horizontal ? 'x' : 'y';
    const gaps = split.children.length - 1;
    const gapPx = Math.min(options.gapPx, rect[axis] / gaps);
    const space = Math.max(0, rect[axis] - gapPx * gaps);
    const minimums = split.children.map((child) => minimumSize(child, options)[axis]);
    const { px, clamped } = distribute(split.sizes, minimums, space);
    const total = split.sizes.reduce((sum, share) => sum + share, 0);
    splitSpaces.set(node, { shareSpacePx: space, totalShare: total });
    const synced = clamped && space > 0 ? px.map((length) => Math.max(MIN_SHARE_RATIO, length * total / space)) : [...split.sizes];
    let offset = 0;
    const childRects = px.map((length) => {
      const childRect: LayoutRect = { ...rect, [start]: rect[start] + offset, [axis]: length };
      offset += length + gapPx;
      return childRect;
    });
    split.children.forEach((child, i) => {
      visit(child, childRects[i], [...path, i]);
      if (i === gaps) return;
      handles.push({
        key: `${path.join('.')}:${i}`, path, split: node, sizes: synced, a: i, b: i + 1, childRects, shareSpacePx: space, minimums,
        rect: { ...childRects[i], [start]: childRects[i][start] + px[i], [axis]: gapPx },
      });
    });
  }
  const bounds = { width: Math.max(0, size.width), height: Math.max(0, size.height) };
  if (root) visit(root, { x: 0, y: 0, ...bounds }, []);
  return { tiles, slots, handles, splitSpaces };
}

/** Saved shares land on 0.5% of the split, so equal percents give equal layouts. */
export const RESIZE_STEP_RATIO = 0.005;
/** One arrow press moves 1% of the split. */
export const RESIZE_KEY_STEPS = 2;
/** Absorbs float error so a bound sitting on a step counts as on it. */
const STEP_EPSILON = 1e-9;

/** `free` follows the pointer; `nearest` lands on the closest step; `by` moves whole steps from the current one. */
export type ResizeSnap = { kind: 'free' } | { kind: 'nearest' } | { kind: 'by'; steps: number };

function snappedShare(current: number, target: number, step: number, low: number, high: number, snap: ResizeSnap): number | undefined {
  if (snap.kind === 'free') return undefined;
  const wanted = snap.kind === 'nearest' ? Math.round(target / step) : Math.round(current / step) + snap.steps;
  const lowest = Math.ceil(low / step - STEP_EPSILON);
  const highest = Math.floor(high / step + STEP_EPSILON);
  if (lowest > highest) return undefined;
  return Math.min(highest, Math.max(lowest, wanted)) * step;
}

/** Moves a divider `deltaPx`: share passes between its two sides, each kept at or above its minimum. */
export function resizedShares(handle: LayoutHandle, deltaPx: number, snap: ResizeSnap = { kind: 'free' }): number[] {
  const { sizes, a, b, minimums, shareSpacePx } = handle;
  const total = sizes.reduce((sum, share) => sum + share, 0);
  if (shareSpacePx <= 0 || total <= 0) return sizes;
  const pxPerShare = shareSpacePx / total;
  const floor = (i: number) => Math.max(Math.max(...sizes) * MIN_SHARE_RATIO, minimums[i] / pxPerShare);
  // Untouched shares bound the largest share saved-ratio validation allows.
  const untouched = sizes.filter((_, i) => i !== a && i !== b);
  const maximum = untouched.length ? Math.min(...untouched) / MIN_SHARE_RATIO : Infinity;
  const low = Math.max(floor(a) - sizes[a], sizes[b] - maximum);
  const high = Math.min(sizes[b] - floor(b), maximum - sizes[a]);
  if (low > high) return sizes;
  const current = sizes[a];
  const free = Math.max(low, Math.min(high, deltaPx / pxPerShare));
  const snapped = snappedShare(current, current + free, RESIZE_STEP_RATIO * total, current + low, current + high, snap);
  const delta = snapped === undefined ? free : snapped - current;
  const next = [...sizes];
  next[a] += delta;
  next[b] -= delta;
  return next;
}

/** Shares that give both sides of a divider the same length. */
export function equalisedShares(handle: LayoutHandle): number[] {
  const axis = axisOf(handle.split);
  const delta = (handle.childRects[handle.b][axis] - handle.childRects[handle.a][axis]) / EVEN_SPLIT_PARTS;
  return resizedShares(handle, delta);
}
