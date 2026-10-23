import type { Page } from '@playwright/test';

/**
 * One painted frame: each on-screen row's bottom and top edge, relative to the scroller's top. `edgeTop`/`edgeBottom`
 * bound the visible area; `above`/`below`: a rendered row lies wholly past that edge, so rows must reach it.
 */
export type Frame = {
  t: number;
  rows: Record<number, number>;
  tops: Record<number, number>;
  shift: number;
  busy: boolean;
  edgeTop: number;
  edgeBottom: number;
  above: boolean;
  below: boolean;
};

export const SCROLLER = '[data-testid="vlog-scroller"]';

declare global {
  interface Window {
    __frames: Frame[];
    __recording: boolean;
    /** Disconnects the current recording's observers. */
    __stopObservers?: () => void;
  }
}

/**
 * Records every painted frame. Frame callbacks run before resize observers, so a size change seen there may not be
 * corrected yet; an observer made after the log's samples again after its correction: the state that is painted.
 */
export async function startRecording(page: Page): Promise<void> {
  await page.evaluate((sel) => {
    window.__stopObservers?.();
    window.__frames = [];
    window.__recording = true;
    const scroller = document.querySelector(sel)!;
    const vlog = (window as unknown as { __vlog: { shift(): number; isScrolling(): boolean } }).__vlog;
    const sample = (): Frame => {
      const s = scroller.getBoundingClientRect();
      const rows: Record<number, number> = {};
      const tops: Record<number, number> = {};
      let above = false;
      let below = false;
      for (const el of scroller.querySelectorAll<HTMLElement>('[data-msg]')) {
        const b = el.getBoundingClientRect();
        // On screen only: rows in the overscan can't pop where anyone sees them.
        if (b.bottom > s.top + 1 && b.top < s.bottom - 1) {
          rows[Number(el.dataset['msg'])] = b.bottom - s.top;
          tops[Number(el.dataset['msg'])] = b.top - s.top;
        } else if (b.bottom <= s.top + 1) above = true;
        else below = true;
      }
      const edgeTop = scroller.clientTop;
      const edgeBottom = scroller.clientTop + scroller.clientHeight;
      return { t: performance.now(), rows, tops, shift: vlog.shift(), busy: vlog.isScrolling(), edgeTop, edgeBottom, above, below };
    };
    let painted: Frame | null = null;
    const ro = new ResizeObserver(() => void (painted = sample()));
    const watch = (): void => scroller.querySelectorAll('[data-row-key]').forEach((e) => ro.observe(e));
    const mo = new MutationObserver(watch);
    mo.observe(scroller, { childList: true, subtree: true });
    watch();
    window.__stopObservers = () => {
      ro.disconnect();
      mo.disconnect();
      window.__stopObservers = undefined;
    };
    const tick = (): void => {
      if (painted) window.__frames.push(painted);
      if (!window.__recording) return;
      painted = sample();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, SCROLLER);
}

export async function stopRecording(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    window.__recording = false;
    window.__stopObservers?.();
    return window.__frames;
  });
}

export async function clearFrames(page: Page): Promise<void> {
  await page.evaluate(() => (window.__frames = []));
}

/**
 * Per frame: the median step of rows on screen in both frames, the step of the row at the view's top edge (the one
 * read), and the spread between the rows' steps (0 when the content moves as one).
 */
export function steps(fs: Frame[]): { i: number; median: number; top: number; spread: number; deltas: Record<number, number> }[] {
  const out = [];
  for (let i = 1; i < fs.length; i++) {
    const a = fs[i - 1]!.rows;
    const b = fs[i]!.rows;
    const common = Object.keys(a).filter((k) => k in b).map(Number);
    if (common.length === 0) continue;
    const deltas: Record<number, number> = {};
    for (const k of common) deltas[k] = b[k]! - a[k]!;
    const d = Object.values(deltas).sort((x, y) => x - y);
    const topKey = common.reduce((m, k) => (a[k]! < a[m]! ? k : m));
    out.push({ i, median: d[d.length >> 1]!, top: deltas[topKey]!, spread: d[d.length - 1]! - d[0]!, deltas });
  }
  return out;
}

/** Sub-pixel layout slack when comparing row edges, px. */
const EDGE_TOLERANCE_PX = 1;

/**
 * Frames whose on-screen rows don't tile the view: none at all, a gap, an overlap, a missing row, or a gap at an edge
 * that a rendered row lies beyond.
 */
export function untiled(fs: Frame[]): number[] {
  return fs.flatMap((f, i) => {
    const ns = Object.keys(f.rows).map(Number).sort((a, b) => a - b);
    if (ns.length === 0) return [i];
    const interior = ns.some(
      (n, j) => j > 0 && (n !== ns[j - 1]! + 1 || Math.abs(f.tops[n]! - f.rows[ns[j - 1]!]!) > EDGE_TOLERANCE_PX),
    );
    const topGap = f.above && f.tops[ns[0]!]! > f.edgeTop + EDGE_TOLERANCE_PX;
    const bottomGap = f.below && f.rows[ns[ns.length - 1]!]! < f.edgeBottom - EDGE_TOLERANCE_PX;
    return interior || topGap || bottomGap ? [i] : [];
  });
}
