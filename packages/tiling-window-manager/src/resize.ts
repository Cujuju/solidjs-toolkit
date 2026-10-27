import type { LayoutHandle } from './layout';
import { collapsedIndices, heldBy, shareHolders, tradeShares, viewShares } from './tileCollapse';
import { EVEN_SPLIT_PARTS, MIN_SHARE_RATIO } from './tileTree';

/** Saved shares land on 0.5% of the split, so equal percents give equal layouts. */
export const RESIZE_STEP_RATIO = 0.005;
/** One arrow press moves 1% of the split. */
export const RESIZE_KEY_STEPS = 2;
/** Absorbs float error so a bound sitting on a step counts as on it. */
const STEP_EPSILON = 1e-9;

/** `free` follows the pointer; `nearest` lands on the closest step; `by` moves whole steps from the current one. */
export type ResizeSnap = { kind: 'free' } | { kind: 'nearest' } | { kind: 'by'; steps: number };
const FREE: ResizeSnap = { kind: 'free' };

function snappedShare(current: number, target: number, step: number, low: number, high: number, snap: ResizeSnap): number | undefined {
  if (snap.kind === 'free') return undefined;
  const wanted = snap.kind === 'nearest' ? Math.round(target / step) : Math.round(current / step) + snap.steps;
  const lowest = Math.ceil(low / step - STEP_EPSILON);
  const highest = Math.floor(high / step + STEP_EPSILON);
  if (lowest > highest) return undefined;
  return Math.min(highest, Math.max(lowest, wanted)) * step;
}

/**
 * Moves a divider `deltaPx`: on-screen share passes between its two open sides, each kept at its minimum.
 * A side that holds collapsed strips keeps their pixels and spends their come-back shares last.
 */
export function resizedShares(handle: LayoutHandle, deltaPx: number, snap: ResizeSnap = FREE): number[] {
  const { a, b, minimums, shareSpacePx: space, fundedPx } = handle;
  const split = { ...handle.split, sizes: handle.sizes };
  const collapsed = collapsedIndices(split);
  if (collapsed.has(a) || collapsed.has(b) || space <= 0) return handle.sizes;
  const holders = shareHolders(split);
  const view = viewShares(split, holders);
  const total = view.reduce((sum, share, i) => sum + (collapsed.has(i) ? 0 : share), 0);
  if (total <= 0) return handle.sizes;
  const pxPerShare = space / total;
  const ratioFloor = Math.max(...split.sizes, view[a] + view[b]) * MIN_SHARE_RATIO;
  // Every own share keeps its slot's minimum, so a reopen never has to squeeze a neighbour.
  const floors = split.sizes.map((_, i) => Math.max(ratioFloor, minimums[i] / pxPerShare));
  const viewFloor = (i: number) => Math.max((minimums[i] + fundedPx[i]) / pxPerShare,
    heldBy(split, i, holders).reduce((sum, held) => sum + floors[held], floors[i]));
  // Untouched shares bound the largest share saved-ratio validation allows.
  const untouched = split.sizes.filter((_, i) => i !== a && i !== b);
  const maximum = untouched.length ? Math.min(...untouched) / MIN_SHARE_RATIO : Infinity;
  const low = Math.max(viewFloor(a) - view[a], split.sizes[b] - maximum);
  const high = Math.min(view[b] - viewFloor(b), maximum - split.sizes[a]);
  if (low > high) return handle.sizes;
  const current = view[a];
  const free = Math.max(low, Math.min(high, deltaPx / pxPerShare));
  const snapped = snappedShare(current, current + free, RESIZE_STEP_RATIO * total, current + low, current + high, snap);
  const delta = snapped === undefined ? free : snapped - current;
  const [gainer, loser] = delta >= 0 ? [a, b] : [b, a];
  return tradeShares(split, gainer, loser, Math.abs(delta), floors);
}

/** Shares that give both sides of a divider the same length. */
export function equalisedShares(handle: LayoutHandle): number[] {
  const axis = handle.split.dir === 'row' ? 'width' : 'height';
  const delta = (handle.childRects[handle.b][axis] - handle.childRects[handle.a][axis]) / EVEN_SPLIT_PARTS;
  return resizedShares(handle, delta);
}
