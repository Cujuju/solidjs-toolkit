import { batch, createEffect, createMemo, createSignal, on, onCleanup, untrack, type Accessor } from 'solid-js';
import { safeAddEventListener, safeResizeObserver, blockSize, isBrowser, nextFrame, toDevicePx } from './_internal/dom';
import { alignedOffset, anchoredOffset, captureAnchor, clamp, type Align, type AnchorSnap } from './core/anchor';
import { createLayout } from './core/layout';
import { createSettle } from './core/settle';

export interface VirtualLogOptions<R> {
  /** Chronological: oldest first. */
  rows: Accessor<readonly R[]>;
  /** Stable per row; default `row.key`. */
  getKey?: (row: R) => string;
  /** Height guess before a row is measured. */
  estimateSize: number | ((row: R) => number);
  /** Pixels drawn beyond each viewport edge; default one viewport. */
  overscanPx?: number;
  /** Rows drawn beyond `overscanPx`; default 4. */
  overscan?: number;
  /** Space under the newest row, kept visible when scrolling to it. */
  endPadding?: number | Accessor<number>;
  /** The view follows the newest row: it stays on it as rows arrive or grow. */
  following?: Accessor<boolean>;
  /** Older rows exist beyond the oldest loaded: reserves a runway above it. Unset, no runway. */
  hasOlder?: Accessor<boolean>;
  /** Prepends older rows. */
  loadOlder?: () => Promise<unknown>;
  /** Load older rows when the top edge is within this many rows of the oldest, or two viewports; default 10. */
  olderThreshold?: number;
  /** Newer rows exist beyond the newest loaded (a log opened around an older row). */
  hasNewer?: Accessor<boolean>;
  /** Appends newer rows; called as the bottom edge nears the newest loaded row, as loadOlder is at the top. */
  loadNewer?: () => Promise<unknown>;
  /** Blank space above the oldest row while `hasOlder` (and below the newest while `hasNewer`), so a fling isn't stopped
   * at the loaded edge while more loads; default 3 viewports. */
  runwayPx?: number;
  /** Changing it (density, font size) marks every measurement stale. */
  layoutKey?: Accessor<unknown>;
}

export interface VirtualLogController<R> {
  /** Ref for the scroll container. Sets its structural styles (column-reverse, no native anchoring). */
  ref: (el: HTMLElement) => void;
  rows: Accessor<readonly R[]>;
  rowByKey: (key: string) => R | undefined;
  /** Every row's key, oldest first. */
  allKeys: Accessor<string[]>;
  /** Keys of the drawn rows, oldest first. */
  keys: Accessor<string[]>;
  /** A row's distance from the canvas bottom to its bottom edge. */
  startOf: (key: string) => number;
  /** The canvas height. Changes only while the scroller is at rest. */
  extent: Accessor<number>;
  /** Corrections taken while scrolling, shown by translating the rows; moved into the scroll offset at rest. */
  shift: Accessor<number>;
  /** Pixels from the view's bottom edge to the newest row's end. */
  distanceFromBottom: () => number;
  /** Pixels from the view's top edge to the top; positive while older rows remain or a runway is still drawn. */
  distanceFromTop: () => number;
  /** How far the user's last scroll moved the view up (positive) or down; 0 for the log's own writes. */
  lastScrollDelta: () => number;
  /** The newest row wholly or mostly in view. */
  inViewKey: () => string | null;
  /** Brings a row into view; false when no row has the key. */
  scrollToKey: (key: string, opts?: { align?: Align }) => boolean;
  /** Centers a row and keeps it centered as rows are measured, until the user scrolls. Null lets go. */
  holdRow: (key: string | null) => boolean;
  holding: Accessor<boolean>;
  scrollToBottom: () => void;
  /** The user or a scroll animation is moving the view. */
  isScrolling: () => boolean;
  /** Loads older rows if the top is near; coalesced. */
  checkOlder: () => Promise<void>;
  /** Loads newer rows if the bottom is near and `hasNewer()`; coalesced. */
  checkNewer: () => Promise<void>;
  /** @internal VirtualLog's canvas. */
  attachCanvas: (el: HTMLElement) => void;
  /** @internal VirtualLog's rows. */
  observeRow: (el: HTMLElement, key: string) => void;
  /** @internal */
  unobserveRow: (el: HTMLElement) => void;
}

const DEFAULT_OLDER_THRESHOLD = 10;
const DEFAULT_OVERSCAN = 4;
const DEFAULT_RUNWAY_VIEWPORTS = 3;
/** Newer rows load when the newest loaded is within this many viewports below the view. */
const NEWER_LOOKAHEAD_VIEWPORTS = 4;
/** Folding a held correction adds at most this much of the scroll's own step (content at most 2x the scroll). */
const MAX_FOLD = 1;
/** An offset this close past an end is at the end (engines round; WebKit rests 1px past the bottom). */
const END_SLOP_PX = 2;
const MIN_ESTIMATE_SCALE = 0.5;
const MAX_ESTIMATE_SCALE = 4;
/** Estimates are rescaled at rest only when the measured ratio moved by more than this. */
const ESTIMATE_SCALE_STEP = 0.05;
/** A scroll event this close to a position we wrote, this soon after, is our own. */
const OWN_WRITE_PX = 1;
const OWN_WRITE_MS = 250;
/** Keys that scroll the scroller itself when it has focus. */
const NAV_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', ' ', 'ArrowUp', 'ArrowDown']);

const defaultKey = (row: unknown): string => (row as { key: string }).key;
const sameKeys = (a: string[], b: string[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * A virtualized, bottom-anchored log. Never writes the scroll offset while the user scrolls: corrections then go to
 * `shift`, a translate on the rows, and move into the offset once the scroller rests. See README for the model.
 */
export function createVirtualLog<R>(o: VirtualLogOptions<R>): VirtualLogController<R> {
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
  let pendingNav: { key: string; align: Align } | null = null;
  let topSnap: AnchorSnap | null = null;
  let ownWrites: { p: number; at: number }[] = [];
  let width = 0;
  /** The runway in the committed extent: the top is only real once it is gone. */
  let committedRunway = 0;
  /**
   * Blank space under the newest row while newer rows remain (`hasNewer`). Bottom-anchored, every row added or grown below
   * the view would otherwise move the view up; mid-scroll that is a correction held in shift, and a whole page of
   * newer rows held there leaves them past a false bottom. Instead they take this space, and nothing moves. Refilled at rest.
   */
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
  onCleanup(() => (alive = false));

  const native = (): number => (scroller ? -scroller.scrollTop : 0);
  const maxNative = (): number => (scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0);
  const logical = (): number => p() + shift();
  /** Hidden (display: none, a folded panel, a background tab): sizes read 0 and writes do nothing. */
  const hidden = (): boolean => !scroller || scroller.clientHeight === 0 || scroller.getClientRects().length === 0;
  const runway = (): number => (o.hasOlder?.() ? (o.runwayPx ?? DEFAULT_RUNWAY_VIEWPORTS * viewH()) : 0);

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
        onSettle: () => settled(),
        // Stopped against the bottom holding a correction (a false bottom): no momentum to wait out, so commit now.
        restingAtEnd: () => native() <= END_SLOP_PX && Math.abs(untrack(shift)) >= 1,
      })
    : null;
  onCleanup(() => settle?.dispose());
  const busy = (): boolean => settle?.busy() ?? false;

  const captureAnchors = (): void => {
    const L = untrack(logical);
    topSnap = captureAnchor(layout, L + untrack(viewH), L, 'bottom');
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
      const d = alignedOffset(layout, held, 'center', L, untrack(viewH), untrack(endPadding));
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
      // At rest, on the newest row. Mid-scroll the newest row's end holds where it is, as a column-reverse scroller
      // keeps it natively: posts arriving push the content up then, rather than a held correction snapping it at rest.
      return busy() ? L : bottomRunway;
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
    const nav = pendingNav ?? (untrack(heldKey) !== null ? { key: untrack(heldKey)!, align: 'center' as const } : null);
    pendingNav = null;
    if (nav) L = alignedOffset(layout, nav.key, nav.align, L, untrack(viewH), untrack(endPadding)) ?? L;
    commit(L);
    captureAnchors();
  }

  // Rows: sizes stay with their keys; the anchors captured before the change say where the view goes.
  const keyList = createMemo(() => o.rows().map(getKey));
  createEffect(
    on(keyList, (keys) => {
      rowsNow = untrack(o.rows);
      layout.setKeys(keys);
      const held = untrack(heldKey);
      if (held !== null && layout.indexOf(held) < 0) setHeldKey(null);
      if (pendingNav && layout.indexOf(pendingNav.key) < 0) pendingNav = null;
      relayout();
    }),
  );
  createEffect(
    on(endPadding, (pad) => {
      layout.setEndPadding(pad + bottomRunway);
      relayout();
    }, { defer: true }),
  );
  if (o.layoutKey) createEffect(on(o.layoutKey, () => layout.invalidate(), { defer: true }));
  // Keeps the runway in step with hasOlder once at rest.
  if (o.hasOlder) createEffect(on(o.hasOlder, () => !busy() && relayout(), { defer: true }));
  if (o.hasNewer) createEffect(on(o.hasNewer, () => !busy() && relayout(), { defer: true }));

  // Measurement: rows report their border-box height; one batch, one relayout.
  const elKey = new Map<Element, string>();
  const measureOne = (el: Element, h: number): boolean => {
    const key = elKey.get(el);
    // Hidden, every row reads 0: kept sizes stay until it shows again.
    return key !== undefined && !hidden() && layout.setSize(key, toDevicePx(h));
  };
  /** A navigation refines until its row is measured, even at exactly its estimate (no size change to relayout on). */
  const navMeasured = (): boolean => pendingNav !== null && layout.measured(pendingNav.key);
  let mounted = new Set<HTMLElement>();
  let flushQueued = false;
  // Rows drawn in a resize observer callback are observed only next frame; measured here, before paint.
  const flushMounted = (): void => {
    flushQueued = false;
    if (!alive) return;
    const els = mounted;
    mounted = new Set();
    let changed = false;
    for (const el of els) if (el.isConnected) changed = measureOne(el, el.getBoundingClientRect().height) || changed;
    if (changed || navMeasured()) relayout();
  };
  // Created with the log, not a row: its cleanup belongs to the log's owner.
  const ro = safeResizeObserver((entries) => {
    let changed = false;
    for (const e of entries) {
      if (e.target === scroller) viewport();
      else changed = measureOne(e.target, blockSize(e)) || changed;
    }
    if (changed || navMeasured()) relayout();
  });

  const viewport = (): void => {
    // Hidden: keep the last view (and its anchors); the browser restores the offset when it shows again.
    if (!scroller) return;
    if (hidden()) {
      wasHidden = true;
      return;
    }
    const w = scroller.clientWidth;
    if (width > 0 && w !== width) layout.invalidate();
    width = w;
    const shown = wasHidden;
    wasHidden = false;
    batch(() => {
      setViewH(scroller!.clientHeight);
      // A column-reverse scroller keeps its bottom edge as it resizes (a keyboard opening): nothing to correct.
      setP(native());
      // Shown again: rows that came or grew while hidden are placed by the anchors from before it hid.
      if (!shown) captureAnchors();
    });
    // The runway is sized by the viewport, and rows may have changed while hidden: recommit at rest.
    if (!busy()) relayout();
    else void checkEdges();
  };

  let inflightNewer: Promise<void> | null = null;
  const checkNewer = (): Promise<void> => {
    if (inflightNewer) return inflightNewer;
    if (!alive || !o.loadNewer || !o.hasNewer?.() || !scroller || hidden() || layout.count === 0) return Promise.resolve();
    const L = untrack(logical);
    const near = layout.count - 1 - layout.indexAt(L) <= threshold || L - bottomRunway < NEWER_LOOKAHEAD_VIEWPORTS * untrack(viewH);
    if (!near) return Promise.resolve();
    const before = layout.count;
    inflightNewer = o.loadNewer().then(
      () => {
        inflightNewer = null;
        // Rows came: check both ends again. None: this end waits for the next scroll; the other may be due.
        queueMicrotask(() => (layout.count !== before ? checkEdges() : void checkOlder()));
      },
      () => void (inflightNewer = null),
    );
    return inflightNewer;
  };
  const checkEdges = (): void => {
    void checkOlder();
    void checkNewer();
  };

  let inflight: Promise<void> | null = null;
  const checkOlder = (): Promise<void> => {
    if (inflight) return inflight;
    if (!alive || !o.loadOlder || !scroller || hidden() || layout.count === 0 || (o.hasOlder && !o.hasOlder())) return Promise.resolve();
    const topEdge = untrack(logical) + untrack(viewH);
    const near = layout.indexAt(topEdge) <= threshold || layout.total() - topEdge < 2 * untrack(viewH);
    if (!near) return Promise.resolve();
    const before = layout.count;
    const done = (): void => {
      inflight = null;
    };
    inflight = o.loadOlder().then(
      () => {
        done();
        // Rows arrived: maybe still near the top (a short page). None: stop until the next scroll.
        queueMicrotask(() => (layout.count !== before ? checkEdges() : void checkNewer()));
      },
      done,
    );
    return inflight;
  };

  const releaseHold = (): void => void setHeldKey(null);
  const cancelNav = (): void => {
    pendingNav = null;
  };
  const userPointer = (): void => {
    releaseHold();
    cancelNav();
  };

  const onScroll = (): void => {
    const now = performance.now();
    const n = native();
    ownWrites = ownWrites.filter((w) => now - w.at < OWN_WRITE_MS);
    const own = ownWrites.findIndex((w) => Math.abs(w.p - n) < OWN_WRITE_PX);
    const prev = untrack(p);
    let s = untrack(shift);
    if (own >= 0) {
      ownWrites.splice(own, 1);
      lastDelta = 0;
    } else {
      settle?.activity();
      lastDelta = n - prev;
      // A correction held while scrolling (posts that arrived, rows below that grew) puts the newest rows past the
      // native bottom. Nearing it, fold the correction away in step with the scroll, so the newest row arrives exactly
      // at the bottom: content runs up to 2x the scroll there, never jumps, and there is no false bottom to stop at.
      const zone = untrack(viewH) + 2 * Math.abs(s);
      if (s !== 0 && n < prev && n < zone) {
        const folded = (s * Math.max(0, n)) / Math.min(prev, zone);
        // Never faster than 2x the scroll, even when a correction lands near the bottom (a false bottom then: it settles at once).
        const most = MAX_FOLD * (prev - n);
        s = Math.abs(s - folded) <= most ? folded : s - Math.sign(s) * most;
      }
    }
    batch(() => {
      setP(n);
      setShift(s);
    });
    captureAnchors();
    void checkEdges();
  };

  const touchCount = (e: TouchEvent): void => settle?.touches(e.touches.length);
  // iOS sends a touch's moves and end to the node it began on, even once that row is removed from the log.
  const watched = new WeakSet<EventTarget>();
  const watchTouchTarget = (t: EventTarget | null): void => {
    if (!t || t === scroller || watched.has(t)) return;
    watched.add(t);
    const move = (e: Event): void => touchCount(e as TouchEvent);
    const end = (e: Event): void => {
      touchCount(e as TouchEvent);
      if ((e as TouchEvent).touches.length === 0) {
        t.removeEventListener('touchmove', move);
        t.removeEventListener('touchend', end);
        t.removeEventListener('touchcancel', end);
        watched.delete(t);
      }
    };
    t.addEventListener('touchmove', move, { passive: true });
    t.addEventListener('touchend', end, { passive: true });
    t.addEventListener('touchcancel', end, { passive: true });
  };

  return {
    ref: (el) => {
      scroller = el;
      // Structural: bottom-anchored scrolling; no browser anchoring (this log keeps its own place); never sideways.
      Object.assign(el.style, { display: 'flex', flexDirection: 'column-reverse', overflowAnchor: 'none', overflowX: 'hidden' });
      const passive = { passive: true };
      safeAddEventListener(el, 'scroll', onScroll, passive);
      safeAddEventListener(el, 'wheel', () => {
        userPointer();
        settle?.activity();
      }, passive);
      safeAddEventListener(el, 'touchstart', (e) => {
        userPointer();
        touchCount(e as TouchEvent);
        watchTouchTarget(e.target);
      }, passive);
      safeAddEventListener(el, 'touchmove', (e) => touchCount(e as TouchEvent), passive);
      safeAddEventListener(el, 'touchend', (e) => touchCount(e as TouchEvent), passive);
      safeAddEventListener(el, 'touchcancel', (e) => touchCount(e as TouchEvent), passive);
      safeAddEventListener(el, 'pointerdown', (e) => {
        const pe = e as PointerEvent;
        userPointer();
        // Touch is tracked by touch events: iOS cancels the pointer as soon as a pan starts.
        if (pe.pointerType !== 'touch') settle?.pointer(true);
      }, passive);
      if (isBrowser()) {
        const up = (): void => settle?.pointer(false);
        safeAddEventListener(window, 'pointerup', up, passive);
        safeAddEventListener(window, 'pointercancel', up, passive);
        safeAddEventListener(window, 'blur', up);
        // Backgrounded mid-touch: its end may never come.
        safeAddEventListener(document, 'visibilitychange', () => {
          if (document.visibilityState !== 'hidden') return;
          settle?.pointer(false);
          settle?.touches(0);
        });
      }
      safeAddEventListener(el, 'keydown', (e) => {
        const ke = e as KeyboardEvent;
        releaseHold();
        const t = ke.target as HTMLElement | null;
        if (NAV_KEYS.has(ke.key) && !(t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? ''))) {
          // The keyboard scrolls on its own (row arrows navigate again after this, in VirtualLog).
          cancelNav();
          settle?.activity();
        }
      });
      ro?.observe(el);
      width = el.clientWidth;
      setViewH(el.clientHeight);
      setP(native());
      relayout();
    },
    rows: o.rows,
    allKeys: keyList,
    rowByKey: (() => {
      const byKey = createMemo(() => new Map(o.rows().map((r) => [getKey(r), r])));
      return (key: string) => byKey().get(key);
    })(),
    keys: createMemo<string[]>(
      (prev) => {
        version();
        const L = logical();
        const h = viewH();
        const pad = o.overscanPx ?? h;
        const r = layout.range(L - pad, L + h + pad, o.overscan ?? DEFAULT_OVERSCAN);
        const out: string[] = [];
        for (let i = r.first; i <= r.last; i++) out.push(layout.keyAt(i));
        return sameKeys(prev, out) ? prev : out;
      },
      [],
    ),
    startOf: (key) => {
      version();
      const i = layout.indexOf(key);
      return i < 0 ? 0 : layout.startAt(i);
    },
    extent,
    shift,
    // To the newest loaded row's end, above any bottom runway.
    distanceFromBottom: () => (version(), logical() - bottomRunway),
    distanceFromTop: () => {
      // The committed extent, not the rows' total: a runway stays drawn until the scroller rests.
      const d = extent() - viewH() - p();
      return o.hasOlder?.() || committedRunway > 0 ? Math.max(1, d) : d;
    },
    lastScrollDelta: () => lastDelta,
    inViewKey: () => {
      version();
      if (layout.count === 0) return null;
      const L = logical();
      let i = layout.indexAt(L);
      // The newest row is cut by the bottom edge: the next older one is the newest really in view.
      if (layout.startAt(i) < L - 0.5 && i > 0 && layout.startAt(i - 1) < L + viewH()) i--;
      return layout.keyAt(i);
    },
    scrollToKey: (key, opts) => {
      if (layout.indexOf(key) < 0) return false;
      setHeldKey(null);
      const align = opts?.align ?? 'auto';
      const d = alignedOffset(layout, key, align, untrack(logical), untrack(viewH), untrack(endPadding));
      pendingNav = layout.measured(key) ? null : { key, align };
      if (d !== null) commit(d);
      captureAnchors();
      return true;
    },
    holdRow: (key) => {
      pendingNav = null;
      if (key === null || layout.indexOf(key) < 0) {
        setHeldKey(null);
        return false;
      }
      setHeldKey(key);
      const d = alignedOffset(layout, key, 'center', untrack(logical), untrack(viewH), untrack(endPadding));
      if (d !== null) commit(d);
      captureAnchors();
      return true;
    },
    holding: () => heldKey() !== null,
    scrollToBottom: () => {
      setHeldKey(null);
      pendingNav = null;
      commit(bottomRunway);
      captureAnchors();
    },
    isScrolling: busy,
    checkOlder,
    checkNewer,
    attachCanvas: (el) => {
      canvas = el;
    },
    observeRow: (el, key) => {
      elKey.set(el, key);
      ro?.observe(el);
      mounted.add(el);
      if (!flushQueued) {
        flushQueued = true;
        queueMicrotask(flushMounted);
      }
    },
    unobserveRow: (el) => {
      elKey.delete(el);
      mounted.delete(el);
      ro?.unobserve(el);
    },
  };
}
