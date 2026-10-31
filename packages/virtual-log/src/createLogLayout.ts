import { batch, createSignal, onCleanup, untrack } from 'solid-js';
import { isBrowser, nextFrame } from './_internal/dom';
import { alignedOffset, anchoredOffset, captureAnchor, clamp, type Align, type AnchorSnap } from './core/anchor';
import { createLayout } from './core/layout';
import { createSettle } from './core/settle';
import { DEFAULT_OLDER_THRESHOLD, DEFAULT_RUNWAY_VIEWPORTS, END_SLOP_PX, MIN_ESTIMATE_SCALE, MAX_ESTIMATE_SCALE, ESTIMATE_SCALE_STEP, defaultKey } from './_internal/constants';
import type { VirtualLogOptions } from './types';

export function createLogLayout<R>(o: VirtualLogOptions<R>, checkEdges: () => void) {
  const getKey = o.getKey ?? defaultKey;
  const estimateOf = typeof o.estimateSize === 'number' ? ((n) => () => n)(o.estimateSize) : o.estimateSize;
  const endPadding = (): number => (typeof o.endPadding === 'function' ? o.endPadding() : (o.endPadding ?? 0));
  const following = (): boolean => o.following?.() ?? false;
  const threshold = o.olderThreshold ?? DEFAULT_OLDER_THRESHOLD;

  let rowsNow: readonly R[] = [];
  const layout = createLayout((_key, i) => estimateOf(rowsNow[i]!), untrack(endPadding));

  let scroller: HTMLElement | undefined;
  let canvas: HTMLElement | undefined;
  const [version, setVersion] = createSignal(0, { equals: false });
  const [p, setP] = createSignal(0);
  const [shift, setShift] = createSignal(0);
  const [viewH, setViewH] = createSignal(0);
  const [extent, setExtent] = createSignal(0);
  const [heldKey, setHeldKey] = createSignal<string | null>(null);
  /** Where the held row is kept. */
  let heldAlign: Align = 'center';
  let pendingNav: { key: string; align: Align } | null = null;
  let topSnap: AnchorSnap | null = null;
  /** Following but scrolled a little up: the row at the bottom edge, which holds instead of the newest row. */
  let bottomSnap: AnchorSnap | null = null;
  let ownWrites: { p: number; at: number }[] = [];
  let width = 0;
  /** The runway in the committed extent: the top is only real once it is gone. */
  let committedRunway = 0;
  /** Newer rows consume this bottom runway during scrolling, avoiding corrections past a false bottom. Refilled at rest. */
  let bottomRunway = 0;
  const bottomRunwayTarget = (): number => (o.hasNewer?.() ? (o.runwayPx ?? 2 * DEFAULT_RUNWAY_VIEWPORTS * untrack(viewH)) : 0);
  /** Sets the bottom runway; the layout's end padding is the caller's plus it. */
  const setBottomRunway = (px: number): void => {
    bottomRunway = px;
    layout.setEndPadding(untrack(endPadding) + px);
  };
  let lastDelta = 0;
  let alive = true;
  let wasHidden = false;
  /** A resize interrupted following at the newest row. Restore it at rest unless the user takes over. */
  let endAfterResize = false;
  onCleanup(() => (alive = false));

  const native = (): number => (scroller ? -scroller.scrollTop : 0);
  const maxNative = (): number => (scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0);
  const logical = (): number => p() + shift();
  /** Hidden (display: none, a folded panel, a background tab): sizes read 0 and writes do nothing. */
  const hidden = (): boolean => !scroller || scroller.clientHeight === 0 || scroller.getClientRects().length === 0;
  const runway = (): number => (o.hasOlder?.() ? (o.runwayPx ?? DEFAULT_RUNWAY_VIEWPORTS * viewH()) : 0);

  /** Public, reactive mirror of `busy()`; internals read `busy()` untracked. */
  const [scrolling, setScrolling] = createSignal(false);
  const settle = isBrowser()
    ? createSettle({
        now: () => performance.now(),
        frame: nextFrame,
        offset: native,
        // A bounce goes far past an end; WebKit also rests a pixel past the bottom of a column-reverse scroller.
        inBounds: () => {
          const n = native();
          return n >= -END_SLOP_PX && n <= maxNative() + END_SLOP_PX;
        },
        onSettle: () => {
          settled();
          setScrolling(false);
        },
        onBusy: () => setScrolling(true),
        // Stopped against the bottom holding a correction (a false bottom): no momentum to wait out, so commit now.
        restingAtEnd: () => native() <= END_SLOP_PX && Math.abs(untrack(shift)) >= 1,
      })
    : null;
  onCleanup(() => settle?.dispose());
  const busy = (): boolean => settle?.busy() ?? false;
  /** Before the viewport or the end padding changes: notes a view following at the newest row mid-scroll. */
  const noteEndBeforeChange = (): void => {
    if (busy() && untrack(following) && untrack(logical) - bottomRunway <= END_SLOP_PX) endAfterResize = true;
  };

  const captureAnchors = (): void => {
    const L = untrack(logical);
    topSnap = captureAnchor(layout, L + untrack(viewH), L, 'bottom');
    bottomSnap = untrack(following) && L - bottomRunway > END_SLOP_PX ? captureAnchor(layout, L, L, 'bottom') : null;
  };

  const writeNative = (to: number): void => {
    if (!scroller) return;
    if (Math.abs(native() - to) >= 0.5) {
      scroller.scrollTop = -to;
      ownWrites.push({ p: native(), at: performance.now() });
    }
    setP(native());
  };

  /** At rest (or navigating): sets the extent, then the offset that shows logical `L`, in one task. */
  const commit = (L: number): void => {
    if (!scroller || hidden()) return;
    // One batch: the drawn range must never see the new offset with the old shift, which would drop and redraw rows.
    batch(() => {
      committedRunway = untrack(runway);
      const total = layout.total() + committedRunway;
      setExtent(total);
      // Written now, not when the signal reaches the DOM: the offset below is clamped against it.
      if (canvas) canvas.style.height = `${total}px`;
      const target = clamp(L, 0, maxNative());
      writeNative(target);
      // A remainder past either end is dropped (a gap kept in shift would never close); a sub-pixel one, from an engine
      // that keeps whole-pixel offsets, stays in shift so nothing moves by it.
      const rest = target - native();
      setShift(Math.abs(rest) < 1 ? rest : 0);
    });
  };

  /** The L the active rule wants after the layout changed. */
  const desiredAfterChange = (): number => {
    const L = untrack(logical);
    const held = untrack(heldKey);
    if (held !== null) {
      const d = alignedOffset(layout, held, heldAlign, L, untrack(viewH), untrack(endPadding));
      if (d !== null) return d;
      setHeldKey(null);
    }
    if (pendingNav) {
      const d = alignedOffset(layout, pendingNav.key, pendingNav.align, L, untrack(viewH), untrack(endPadding));
      if (d === null) pendingNav = null;
      else {
        if (layout.measured(pendingNav.key)) pendingNav = null;
        return d;
      }
    }
    if (untrack(following)) {
      // Mid-scroll the newest row's end holds where it is, as a column-reverse scroller keeps it natively: posts
      // arriving push the content up then, rather than a held correction snapping it at rest.
      if (busy()) return L;
      // At the bottom, the newest row; scrolled a little up, the bottom edge holds.
      return (bottomSnap && anchoredOffset(layout, bottomSnap)) ?? bottomRunway;
    }
    // No row the view held survives (every row replaced): a new log opens at its newest row.
    return topSnap ? (anchoredOffset(layout, topSnap) ?? 0) : L;
  };

  /** After rows change size or come and go: keeps the view where the rule says, writing only at rest. */
  const relayout = (): void => {
    batch(() => {
      setVersion(0);
      // Hidden, there is no view to keep: the next showing relays out.
      if (!scroller || hidden()) {
        wasHidden = !!scroller;
        return;
      }
      // At rest the runway is refilled (or removed); the anchors captured before keep the view where it was.
      if (!busy() && bottomRunway !== bottomRunwayTarget()) setBottomRunway(bottomRunwayTarget());
      let desired = desiredAfterChange();
      if (busy()) {
        // Rows added or grown below the view take the bottom runway instead of moving the view.
        const delta = desired - untrack(logical);
        const reading = untrack(heldKey) === null && !pendingNav && !untrack(following);
        if (reading && (bottomRunway > 0 || (delta < 0 && untrack(o.hasNewer ?? (() => false))))) {
          const left = Math.max(0, bottomRunway - delta);
          desired -= bottomRunway - left;
          setBottomRunway(left);
        }
        setShift(desired - untrack(p));
      } else commit(desired);
      captureAnchors();
    });
    void checkEdges();
  };

  function settled(): void {
    if (!scroller || !alive) return;
    // One batch: the drawn range must see the relaid rows and the committed offset together.
    batch(settleNow);
    void checkEdges();
  }

  function settleNow(): void {
    let L = untrack(logical);
    // At rest: refill the bottom runway, and scale estimates by how measured rows compared with theirs (after a jump,
    // rows not yet measured below the view otherwise grow into it as they are drawn). The view keeps its place.
    let relaid = false;
    if (bottomRunway !== bottomRunwayTarget()) {
      setBottomRunway(bottomRunwayTarget());
      relaid = true;
    }
    const ratio = layout.measuredRatio();
    if (ratio !== null) {
      const f = clamp(ratio, MIN_ESTIMATE_SCALE, MAX_ESTIMATE_SCALE);
      if (Math.abs(f - layout.estimateScale) > ESTIMATE_SCALE_STEP) {
        layout.setEstimateScale(f);
        relaid = true;
      }
    }
    if (relaid) {
      setVersion(0);
      L = (topSnap && anchoredOffset(layout, topSnap)) ?? L;
    }
    // A navigation still refining gets this one last placement.
    const nav = pendingNav ?? (untrack(heldKey) !== null ? { key: untrack(heldKey)!, align: heldAlign } : null);
    pendingNav = null;
    if (nav) L = alignedOffset(layout, nav.key, nav.align, L, untrack(viewH), untrack(endPadding)) ?? L;
    // Back on the newest row after a mid-scroll resize left the view short of it.
    if (endAfterResize) {
      endAfterResize = false;
      if (!nav && untrack(following)) L = bottomRunway;
    }
    commit(L);
    captureAnchors();
  }

  return {
    getKey, estimateOf, endPadding, following, threshold,
    layout, version, setVersion, p, setP,
    shift, setShift, viewH, setViewH, extent,
    setExtent, heldKey, setHeldKey, bottomRunwayTarget, setBottomRunway,
    native, maxNative, logical, hidden, runway,
    scrolling, setScrolling, settle, busy, noteEndBeforeChange,
    captureAnchors, writeNative, commit, desiredAfterChange, relayout,
    settled, settleNow,
    get rowsNow() { return rowsNow; },
    set rowsNow(value: readonly R[]) { rowsNow = value; },
    get scroller() { return scroller; },
    set scroller(value: HTMLElement | undefined) { scroller = value; },
    get canvas() { return canvas; },
    set canvas(value: HTMLElement | undefined) { canvas = value; },
    get heldAlign() { return heldAlign; },
    set heldAlign(value: Align) { heldAlign = value; },
    get pendingNav() { return pendingNav; },
    set pendingNav(value: { key: string; align: Align } | null) { pendingNav = value; },
    get ownWrites() { return ownWrites; },
    set ownWrites(value: { p: number; at: number }[]) { ownWrites = value; },
    get width() { return width; },
    set width(value: number) { width = value; },
    get committedRunway() { return committedRunway; },
    set committedRunway(value: number) { committedRunway = value; },
    get bottomRunway() { return bottomRunway; },
    set bottomRunway(value: number) { bottomRunway = value; },
    get lastDelta() { return lastDelta; },
    set lastDelta(value: number) { lastDelta = value; },
    get alive() { return alive; },
    set alive(value: boolean) { alive = value; },
    get wasHidden() { return wasHidden; },
    set wasHidden(value: boolean) { wasHidden = value; },
    get endAfterResize() { return endAfterResize; },
    set endAfterResize(value: boolean) { endAfterResize = value; },
  };
}
