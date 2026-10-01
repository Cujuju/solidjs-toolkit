/**
 * Where the view should be after rows change size or come and go. Offsets are bottom-relative: `L` is how far the
 * viewport's bottom edge sits above the canvas bottom.
 */
import type { Layout } from './layout';

interface Pin {
  key: string;
  /** The pinned edge's offset minus L. */
  rel: number;
}

/** Which edge of the pinned row holds: its bottom (it grows upward) or its top (it grows downward). */
export type PinEdge = 'bottom' | 'top';

/** A row at a viewport edge and where it sat, plus its newer neighbour in case it is removed. */
export interface AnchorSnap {
  edge: PinEdge;
  pins: Pin[];
}

const edgeAt = (layout: Layout, i: number, edge: PinEdge): number => layout.startAt(i) + (edge === 'top' ? layout.sizeAt(i) : 0);

/**
 * Pins the row containing bottom-relative `at` (the view's top edge, L + height, pinning the row's bottom: it grows
 * upward, out of view; or the view's bottom edge, L, pinning its top: it grows downward, out of view).
 */
export function captureAnchor(layout: Layout, at: number, L: number, edge: PinEdge = 'bottom'): AnchorSnap | null {
  const i = layout.indexAt(at);
  if (i < 0) return null;
  const pins: Pin[] = [];
  for (const j of [i, i + 1, i - 1]) if (j >= 0 && j < layout.count) pins.push({ key: layout.keyAt(j), rel: edgeAt(layout, j, edge) - L });
  return { edge, pins };
}

/** The L that puts the pinned row back where it was; null when every pinned row is gone. */
export function anchoredOffset(layout: Layout, snap: AnchorSnap): number | null {
  for (const p of snap.pins) {
    const i = layout.indexOf(p.key);
    if (i >= 0) return edgeAt(layout, i, snap.edge) - p.rel;
  }
  return null;
}

export type Align = 'auto' | 'center';

/**
 * The L that brings a row into a viewport of height `h`: centered, or (auto) the least movement that shows it, its
 * bottom clearing `endPadding` so the newest row keeps its space. Null for an unknown key.
 */
export function alignedOffset(layout: Layout, key: string, align: Align, L: number, h: number, endPadding: number): number | null {
  const i = layout.indexOf(key);
  if (i < 0) return null;
  const start = layout.startAt(i);
  const size = layout.sizeAt(i);
  if (align === 'center') return start + size / 2 - h / 2;
  const bottom = start - endPadding;
  const top = start + size;
  // Taller than the viewport: show its top, where it starts reading.
  if (top - bottom > h) return top - h;
  if (bottom < L) return bottom;
  if (top > L + h) return top - h;
  return L;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
