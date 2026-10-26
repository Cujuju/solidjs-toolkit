import { computeTileLayout, type LayoutRect, type TileLayout, type TileLayoutOptions, type TileSize } from './layout';
import {
  dock, dropZoneAt, EVEN_SPLIT_PARTS, findTile, insertTile, splitAxis, swapTiles, UNIT_SHARE,
  type DockSide, type DropZone, type InsertionShares, type TileNode,
} from './tileTree';

/** A millionth of a CSS pixel permits float roundoff, never a visible neighbour resize. */
const RECT_TOLERANCE_PX = 0.000001;
const matches = (a: LayoutRect, b: LayoutRect) => (['x', 'y', 'width', 'height'] as const)
  .every((key) => Math.abs(a[key] - b[key]) <= RECT_TOLERANCE_PX);
const fits = (rect: LayoutRect, minimum: TileSize) =>
  rect.width + RECT_TOLERANCE_PX >= minimum.width && rect.height + RECT_TOLERANCE_PX >= minimum.height;

export type InsertionPlan =
  | { valid: false; reason: string; rect: LayoutRect }
  | { valid: true; rect: LayoutRect; targetRect: LayoutRect; shares: InsertionShares };

export const TOO_SMALL = 'Not enough room to split here; choose a larger tile';
export const WOULD_RESIZE = 'This split would resize other tiles; choose another spot';
export const UNAVAILABLE = 'This spot is unavailable';

/**
 * Plans adding a tile beside `targetId`: the new tile takes room from the target only, both keep
 * their minimums, and every other tile keeps its rect. Proven on the real layout; nothing is written.
 */
export function planInsertion(
  root: TileNode, insertedId: string, targetId: string, side: DockSide, size: TileSize, options: TileLayoutOptions,
  before: TileLayout = computeTileLayout(root, size, options),
): InsertionPlan {
  const location = findTile(root, targetId);
  const target = before.tiles.get(targetId);
  const unavailable = (reason: string): InsertionPlan => ({ valid: false, reason, rect: target ?? { x: 0, y: 0, ...size } });
  if (!location || !target || findTile(root, insertedId)) return unavailable(UNAVAILABLE);
  const zero = { width: 0, height: 0 };
  const newMinimum = options.minSizes.get(insertedId) ?? zero;
  const targetMinimum = options.minSizes.get(targetId) ?? zero;
  const dir = splitAxis(side);
  const axis = dir === 'row' ? 'width' : 'height';
  const crossAxis = dir === 'row' ? 'height' : 'width';
  const available = target[axis] - options.gapPx;
  if (available < targetMinimum[axis] + newMinimum[axis]
    || target[crossAxis] < Math.max(targetMinimum[crossAxis], newMinimum[crossAxis])) return unavailable(TOO_SMALL);
  // In a same-direction parent, the new gap comes out of the target and every sibling keeps its share and pixels.
  const space = location.parent?.dir === dir ? before.splitSpaces.get(location.parent) : undefined;
  const pxPerShare = space ? space.shareSpacePx / space.totalShare : available / (UNIT_SHARE * EVEN_SPLIT_PARTS);
  if (!(pxPerShare > 0)) return unavailable(TOO_SMALL);
  // Start even, but satisfy both minimums within the target's own pixels.
  const targetPx = Math.max(targetMinimum[axis], Math.min(available / EVEN_SPLIT_PARTS, available - newMinimum[axis]));
  const shares: InsertionShares = [targetPx / pxPerShare, (available - targetPx) / pxPerShare];
  const after = computeTileLayout(insertTile(root, insertedId, targetId, side, shares), size, options);
  const placed = after.tiles.get(insertedId);
  const remaining = after.tiles.get(targetId);
  if (!placed || !remaining || !fits(placed, newMinimum) || !fits(remaining, targetMinimum)) return unavailable(TOO_SMALL);
  for (const [id, rect] of before.tiles) {
    if (id === targetId) continue;
    const moved = after.tiles.get(id);
    if (!moved || !matches(rect, moved)) return unavailable(WOULD_RESIZE);
  }
  return { valid: true, rect: placed, targetRect: remaining, shares };
}

/** The rendered result of moving a tile: the real dock or swap, laid out. Null when the move changes nothing. */
export function planMove(
  root: TileNode, movedId: string, targetId: string, zone: DropZone, size: TileSize, options: TileLayoutOptions,
): { rect: LayoutRect; targetRect: LayoutRect; next: TileNode } | null {
  const next = zone === 'center' ? swapTiles(root, movedId, targetId) : dock(root, movedId, targetId, zone);
  if (next === root) return null;
  const after = computeTileLayout(next, size, options);
  const rect = after.tiles.get(movedId);
  const targetRect = after.tiles.get(targetId);
  return rect && targetRect ? { rect, targetRect, next } : null;
}

export interface TileHit { targetId: string; zone: DropZone; rect: LayoutRect }

/** The tile and zone under a point in workspace coordinates; `exclude` (the dragged tile) is never a target. */
export function tileHitAt(tiles: ReadonlyMap<string, LayoutRect>, x: number, y: number, zones: readonly DropZone[], exclude?: string): TileHit | null {
  for (const [id, rect] of tiles) {
    if (id === exclude || rect.width <= 0 || rect.height <= 0) continue;
    if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) continue;
    const zone = dropZoneAt(zones, (x - rect.x) / rect.width, (y - rect.y) / rect.height);
    return zone ? { targetId: id, zone, rect } : null;
  }
  return null;
}
