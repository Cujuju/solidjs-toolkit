/**
 * Pure geometry of a bottom-anchored log. Rows are chronological (index 0 oldest); a row's `start` is the distance
 * from the canvas bottom to the row's bottom, so rows added or grown above never move rows below them.
 */

export interface LayoutRange {
  /** Oldest drawn row (chronological index), inclusive. */
  first: number;
  /** Newest drawn row (chronological index), inclusive. -1 when empty. */
  last: number;
}

export interface Layout {
  /** Replaces the rows. Sizes stay with their keys; keys no longer present are dropped. */
  setKeys(keys: readonly string[]): void;
  /** Records a measured size. Returns whether anything changed. */
  setSize(key: string, px: number): boolean;
  /** Marks every measurement as stale (width changed): kept as the estimate until measured again. */
  invalidate(): void;
  /** How measured rows compare with their estimates (measured total / estimated total), or null with none measured. */
  measuredRatio(): number | null;
  /** Scales the estimate of every row not yet measured. */
  setEstimateScale(f: number): void;
  readonly estimateScale: number;
  setEndPadding(px: number): void;
  readonly count: number;
  keyAt(index: number): string;
  indexOf(key: string): number;
  /** Measured, else estimated. */
  sizeAt(index: number): number;
  startAt(index: number): number;
  /** Whether the row's size was measured at the current width. */
  measured(key: string): boolean;
  /** Rows plus end padding. */
  total(): number;
  /** Rows touching [lo, hi] (bottom-relative px), widened by `overscan` rows each way. */
  range(lo: number, hi: number, overscan: number): LayoutRange;
  /** The row containing bottom-relative `px`, clamped to the rows; -1 when empty. */
  indexAt(px: number): number;
}

export function createLayout(estimate: (key: string, index: number) => number, endPadding = 0): Layout {
  let keys: readonly string[] = [];
  let indexByKey = new Map<string, number>();
  const sizes = new Map<string, number>();
  let fresh = new Set<string>();
  let starts = new Float64Array(0);
  let totalPx = endPadding;
  let pad = endPadding;
  let dirty = true;
  let scale = 1;

  const sizeAt = (i: number): number => {
    const key = keys[i]!;
    return sizes.get(key) ?? estimate(key, i) * scale;
  };

  const rebuild = (): void => {
    if (!dirty) return;
    dirty = false;
    if (starts.length !== keys.length) starts = new Float64Array(keys.length);
    let s = pad;
    for (let i = keys.length - 1; i >= 0; i--) {
      starts[i] = s;
      s += sizeAt(i);
    }
    totalPx = s;
  };

  /** Newest-first search: the oldest index whose start is <= px (starts fall as the index rises). */
  const firstAtOrBelow = (px: number): number => {
    let lo = 0;
    let hi = keys.length - 1;
    let found = keys.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= px) {
        found = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return found;
  };

  return {
    setKeys(next) {
      keys = next;
      indexByKey = new Map(next.map((k, i) => [k, i]));
      for (const k of sizes.keys()) if (!indexByKey.has(k)) sizes.delete(k);
      for (const k of fresh) if (!indexByKey.has(k)) fresh.delete(k);
      dirty = true;
    },
    setSize(key, px) {
      const i = indexByKey.get(key);
      if (i === undefined) return false;
      fresh.add(key);
      const was = sizeAt(i);
      sizes.set(key, px);
      if (was === px) return false;
      dirty = true;
      return true;
    },
    invalidate() {
      fresh = new Set();
    },
    measuredRatio() {
      let got = 0;
      let guessed = 0;
      for (const key of fresh) {
        const i = indexByKey.get(key);
        const size = sizes.get(key);
        if (i === undefined || size === undefined) continue;
        got += size;
        guessed += estimate(key, i);
      }
      return guessed > 0 ? got / guessed : null;
    },
    setEstimateScale(f) {
      if (f === scale) return;
      scale = f;
      dirty = true;
    },
    get estimateScale() {
      return scale;
    },
    setEndPadding(px) {
      if (px === pad) return;
      pad = px;
      dirty = true;
    },
    get count() {
      return keys.length;
    },
    keyAt: (i) => keys[i]!,
    indexOf: (key) => indexByKey.get(key) ?? -1,
    sizeAt,
    startAt(i) {
      rebuild();
      return starts[i]!;
    },
    measured: (key) => fresh.has(key),
    total() {
      rebuild();
      return totalPx;
    },
    range(lo, hi, overscan) {
      rebuild();
      const n = keys.length;
      if (n === 0) return { first: 0, last: -1 };
      // Newest touching: the row containing lo (its top is the next older row's start, above lo).
      const last = Math.min(firstAtOrBelow(lo), n - 1);
      // Oldest touching: the oldest row whose start is below hi.
      const first = Math.min(firstAtOrBelow(hi), n - 1);
      return { first: Math.max(0, first - overscan), last: Math.min(n - 1, Math.max(last, first) + overscan) };
    },
    indexAt(px) {
      rebuild();
      const n = keys.length;
      if (n === 0) return -1;
      return Math.min(firstAtOrBelow(px), n - 1);
    },
  };
}
