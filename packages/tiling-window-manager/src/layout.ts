import { collapsedIndices, ownShares, peekEdgeOf, shareHolders, viewShares } from './tileCollapse';
import { slotIds, slotKey, type CollapseEdge, type TileNode, type TileSlot, type TileSplit } from './tileTree';

export { equalisedShares, resizedShares, RESIZE_KEY_STEPS, RESIZE_STEP_RATIO, type ResizeSnap } from './resize';

export interface TileSize { width: number; height: number }
export interface LayoutRect extends TileSize { x: number; y: number }

/** A collapsed slot's thickness when none is given: one header row. */
export const DEFAULT_COLLAPSED_PX = 32;

/** One tile or tab group and its box. */
export interface LayoutSlot {
  slot: TileSlot;
  rect: LayoutRect;
  collapsed: boolean;
  /** The edge a collapsed slot's content opens from (toward its holder); null when open. */
  peekEdge: CollapseEdge | null;
  /** Pixels from a collapsed slot to the workspace edge its content opens toward; null when open. */
  peekExtentPx: number | null;
}

export interface LayoutHandle {
  /** Stable while the tree keeps its shape: `<split path>:<gap index>`. */
  key: string;
  /** The gap's index: it sits after child `gap`. */
  gap: number;
  path: number[];
  split: TileSplit;
  /** Shares a drag starts from: the stored ones, or ones matching the pixels when minimums clamped them. */
  sizes: number[];
  /** The two open children either side of the divider; collapsed strips between them move with it. */
  a: number;
  b: number;
  rect: LayoutRect;
  childRects: LayoutRect[];
  /** The split's length along its axis. */
  extentPx: number;
  /** Pixels the open shares divide: their own lengths plus the strips they fund. */
  shareSpacePx: number;
  /** Each child's minimum along the split axis, as if it were open. */
  minimums: number[];
  /** Pixels each open child gives to the collapsed strips it holds. */
  fundedPx: number[];
}

export interface TileLayoutOptions {
  gapPx: number;
  minSizes: ReadonlyMap<string, TileSize>;
  /** Height of a slot collapsed in a column; defaults to `DEFAULT_COLLAPSED_PX`. */
  barPx?: number;
  /** Width of a slot collapsed in a row; defaults to `DEFAULT_COLLAPSED_PX`. */
  stripPx?: number;
  /** Shares of one split under a live drag, shown before they are committed. */
  draft?: { split: TileSplit; sizes: number[] } | null;
}

export interface TileLayout {
  /** Every tile's box; tabs of one group share their group's. */
  tiles: Map<string, LayoutRect>;
  slots: LayoutSlot[];
  handles: LayoutHandle[];
  splitSpaces: Map<TileSplit, { shareSpacePx: number; totalShare: number }>;
}

type MinimumOptions = Pick<TileLayoutOptions, 'gapPx' | 'minSizes' | 'barPx' | 'stripPx'>;
const thickness = (dir: TileSplit['dir'], options: MinimumOptions) =>
  (dir === 'row' ? options.stripPx : options.barPx) ?? DEFAULT_COLLAPSED_PX;

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

/** The node's smallest size: tile minimums plus gaps, collapsed slots at strip thickness. `open` measures it fully expanded. */
export function minimumSize(node: TileNode, options: MinimumOptions, open = false): TileSize {
  if (node.kind === 'tile') return options.minSizes.get(node.id) ?? { width: 0, height: 0 };
  if (node.kind === 'tabs') {
    const tabs = node.children.map((child) => minimumSize(child, options));
    return { width: Math.max(...tabs.map((min) => min.width)), height: Math.max(...tabs.map((min) => min.height)) };
  }
  const collapsed = open ? new Set<number>() : collapsedIndices(node);
  const strip = thickness(node.dir, options);
  const mins = node.children.map((child, i) => {
    const min = minimumSize(child, options, open);
    return !collapsed.has(i) ? min : node.dir === 'row' ? { ...min, width: strip } : { ...min, height: strip };
  });
  const sum = (key: keyof TileSize) => mins.reduce((total, min) => total + min[key], 0) + options.gapPx * (mins.length - 1);
  const max = (key: keyof TileSize) => Math.max(...mins.map((min) => min[key]));
  return node.dir === 'row' ? { width: sum('width'), height: max('height') } : { width: max('width'), height: sum('height') };
}

/** Slot boxes keyed by the id that addresses each slot (a group's active tab): the drop targets. */
export const slotRects = (layout: Pick<TileLayout, 'slots'>): Map<string, LayoutRect> =>
  new Map(layout.slots.map((entry) => [slotKey(entry.slot), entry.rect]));

/** Pixels from a collapsed rect to the workspace edge its content opens toward. */
function peekExtent(rect: LayoutRect, edge: CollapseEdge, size: TileSize): number {
  switch (edge) {
    case 'left': return size.width - rect.x - rect.width;
    case 'right': return rect.x;
    case 'top': return size.height - rect.y - rect.height;
    case 'bottom': return rect.y;
  }
}

/** One geometry source for tiles, strips, dividers, drop previews and placement planning. */
export function computeTileLayout(root: TileNode | undefined, size: TileSize, options: TileLayoutOptions): TileLayout {
  const tiles = new Map<string, LayoutRect>();
  const slots: LayoutSlot[] = [];
  const handles: LayoutHandle[] = [];
  const splitSpaces = new Map<TileSplit, { shareSpacePx: number; totalShare: number }>();
  const bounds = { width: Math.max(0, size.width), height: Math.max(0, size.height) };

  function lengths(split: TileSplit, rect: LayoutRect) {
    const collapsed = collapsedIndices(split);
    const holders = shareHolders(split);
    const shown = viewShares(split, holders).map((share, i) => (collapsed.has(i) ? null : share));
    const axis = split.dir === 'row' ? 'width' : 'height';
    const gapPx = Math.min(options.gapPx, rect[axis] / (split.children.length - 1));
    const available = Math.max(0, rect[axis] - gapPx * (split.children.length - 1));
    const bar = Math.min(thickness(split.dir, options), collapsed.size ? available / collapsed.size : available);
    const strips = split.sizes.map(() => 0);
    holders.forEach((holder) => { strips[holder] += bar; });
    // Own pixels ignore collapse flags, so a toggle moves only the toggled slot and its holder.
    const openMins = split.children.map((child) => minimumSize(child, options, true)[axis]);
    if (openMins.reduce((sum, min) => sum + min, 0) <= available) {
      const own = distribute(split.sizes, openMins, available);
      const allocated = own.px.map((px, i) => (collapsed.has(i) ? bar : px));
      holders.forEach((holder, i) => { allocated[holder] += own.px[i] - bar; });
      return { holders, shown, gapPx, fundedPx: strips, allocated, own, openMins };
    }
    // Too small for every slot open at its minimum: fit the shown shares instead.
    const open = shown.map((share) => share ?? 0);
    const openTotal = open.reduce((sum, share) => sum + share, 0);
    const sharePerPx = available > 0 ? openTotal / available : 0;
    const debited = open.map((share, i) => Math.max(0, share - strips[i] * sharePerPx));
    // Strips filling the whole split leave nothing to debit; plain shares avoid a 0/0 split.
    const funds = debited.some((share) => share > 0);
    const fundedPx = funds ? strips : strips.map(() => 0);
    const mins = split.children.map((child, i) => (shown[i] === null ? 0 : minimumSize(child, options)[axis]));
    const { px } = distribute(funds ? debited : open, mins, Math.max(0, available - collapsed.size * bar));
    return { holders, shown, gapPx, fundedPx, allocated: px.map((length, i) => (shown[i] === null ? bar : length)), own: null, openMins };
  }

  function visit(node: TileNode, rect: LayoutRect, path: number[], collapsed = false, peekEdge: CollapseEdge | null = null) {
    if (node.kind !== 'split') {
      const peekExtentPx = peekEdge ? Math.max(0, peekExtent(rect, peekEdge, bounds)) : null;
      slots.push({ slot: node, rect, collapsed, peekEdge, peekExtentPx });
      slotIds(node).forEach((id) => tiles.set(id, rect));
      return;
    }
    const split = options.draft?.split === node ? { ...node, sizes: options.draft.sizes } : node;
    const { holders, shown, allocated, gapPx, fundedPx, own, openMins } = lengths(split, rect);
    const horizontal = split.dir === 'row';
    const axis = horizontal ? 'width' : 'height';
    const start = horizontal ? 'x' : 'y';
    // Open shares divide their own pixels plus the strips they fund.
    const shareSpace = allocated.reduce((sum, px, i) => sum + (shown[i] === null ? 0 : px + fundedPx[i]), 0);
    const total = shown.reduce<number>((sum, share) => sum + (share ?? 0), 0);
    splitSpaces.set(node, { shareSpacePx: shareSpace, totalShare: total });
    // Stored shares persist until a drag resyncs them: a clamped share from its pixels, an unclamped one as stored.
    const basis = own ? (own.clamped ? own.px.map((px) => px * total / shareSpace) : split.sizes)
      : shown.map((share, i) => (share === null ? split.sizes[i] : (allocated[i] + fundedPx[i]) * total / shareSpace));
    const valid = shareSpace > 0 && basis.every((share) => Number.isFinite(share) && share > 0);
    const sizes = !valid ? [...split.sizes] : own ? [...basis] : ownShares(split, basis, holders);
    let offset = 0;
    const childRects = allocated.map((length) => {
      const childRect: LayoutRect = { ...rect, [start]: rect[start] + offset, [axis]: length };
      offset += length + gapPx;
      return childRect;
    });
    let a = -1;
    split.children.forEach((child, i) => {
      visit(child, childRects[i], [...path, i], shown[i] === null, shown[i] === null ? peekEdgeOf(split, i, holders) : null);
      if (shown[i] !== null) a = i;
      const b = shown.findIndex((value, index) => index > i && value !== null);
      if (a === -1 || b === -1) return;
      handles.push({
        key: `${path.join('.')}:${i}`, gap: i, path, split: node, sizes, a, b, childRects, extentPx: rect[axis],
        shareSpacePx: shareSpace, minimums: openMins, fundedPx,
        rect: { ...childRects[i], [start]: childRects[i][start] + allocated[i], [axis]: gapPx },
      });
    });
  }
  if (root) visit(root, { x: 0, y: 0, ...bounds }, []);
  return { tiles, slots, handles, splitSpaces };
}
