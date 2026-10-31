import { batch, createMemo, untrack } from 'solid-js';
import { safeAddEventListener, isBrowser } from './_internal/dom';
import { alignedOffset } from './core/anchor';

import { DEFAULT_OVERSCAN, MAX_FOLD, OWN_WRITE_PX, OWN_WRITE_MS, NAV_KEYS, sameKeys } from './_internal/constants';
import type { VirtualLogOptions, VirtualLogController } from './types';
import type { createLogLayout } from './createLogLayout';
import type { createLogMeasurement } from './createLogMeasurement';

export function createLogController<R>(
  o: VirtualLogOptions<R>,
  state: ReturnType<typeof createLogLayout<R>>,
  m: ReturnType<typeof createLogMeasurement<R>>,
): VirtualLogController<R> {
  const releaseHold = (): void => void state.setHeldKey(null);
  const cancelNav = (): void => {
    state.pendingNav = null;
  };
  const userPointer = (): void => {
    releaseHold();
    cancelNav();
    state.endAfterResize = false;
  };

  // Batched whole: `settle.activity()` publishes isScrolling, and a consumer reacting to it must run after this
  // handler's offset, shift and anchors are in place, not between them.
  const onScroll = (): void => batch(() => {
    const now = performance.now();
    const n = state.native();
    state.ownWrites = state.ownWrites.filter((w) => now - w.at < OWN_WRITE_MS);
    const own = state.ownWrites.findIndex((w) => Math.abs(w.p - n) < OWN_WRITE_PX);
    const prev = untrack(state.p);
    let s = untrack(state.shift);
    if (own >= 0) {
      state.ownWrites.splice(own, 1);
      state.lastDelta = 0;
    } else {
      state.settle?.activity();
      state.lastDelta = n - prev;
      // Fold held corrections near the native bottom, bounded to twice the scroll speed, so newer rows arrive without a false bottom.
      const zone = untrack(state.viewH) + 2 * Math.abs(s);
      if (s !== 0 && n < prev && n < zone) {
        const folded = (s * Math.max(0, n)) / Math.min(prev, zone);
        // Never faster than 2x the scroll, even when a correction lands near the bottom (a false bottom then: it settles at once).
        const most = MAX_FOLD * (prev - n);
        s = Math.abs(s - folded) <= most ? folded : s - Math.sign(s) * most;
      }
    }
    batch(() => {
      state.setP(n);
      state.setShift(s);
    });
    state.captureAnchors();
    void m.checkEdges();
  });

  const touchCount = (e: TouchEvent): void => state.settle?.touches(e.touches.length);
  // iOS sends a touch's moves and end to the node it began on, even once that row is removed from the log.
  const watched = new WeakSet<EventTarget>();
  const watchTouchTarget = (t: EventTarget | null): void => {
    if (!t || t === state.scroller || watched.has(t)) return;
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
      state.scroller = el;
      // Structural: bottom-anchored scrolling; no browser anchoring (this log keeps its own place); never sideways.
      Object.assign(el.style, { display: 'flex', flexDirection: 'column-reverse', overflowAnchor: 'none', overflowX: 'hidden' });
      const passive = { passive: true };
      safeAddEventListener(el, 'scroll', onScroll, passive);
      safeAddEventListener(el, 'wheel', () => {
        userPointer();
        state.settle?.activity();
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
        if (pe.pointerType !== 'touch') state.settle?.pointer(true);
      }, passive);
      if (isBrowser()) {
        const up = (): void => state.settle?.pointer(false);
        safeAddEventListener(window, 'pointerup', up, passive);
        safeAddEventListener(window, 'pointercancel', up, passive);
        safeAddEventListener(window, 'blur', up);
        // Backgrounded mid-touch: its end may never come.
        safeAddEventListener(document, 'visibilitychange', () => {
          if (document.visibilityState !== 'hidden') return;
          state.settle?.pointer(false);
          state.settle?.touches(0);
        });
      }
      safeAddEventListener(el, 'keydown', (e) => {
        const ke = e as KeyboardEvent;
        releaseHold();
        const t = ke.target as HTMLElement | null;
        if (NAV_KEYS.has(ke.key) && !(t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? ''))) {
          // The keyboard scrolls on its own (row arrows navigate again after this, in VirtualLog).
          cancelNav();
          state.endAfterResize = false;
          state.settle?.activity();
        }
      });
      m.ro?.observe(el);
      state.width = el.clientWidth;
      state.setViewH(el.clientHeight);
      state.setP(state.native());
      state.relayout();
    },
    rows: o.rows,
    allKeys: m.keyList,
    rowByKey: (() => {
      const byKey = createMemo(() => new Map(o.rows().map((r) => [state.getKey(r), r])));
      return (key: string) => byKey().get(key);
    })(),
    keys: createMemo<string[]>(
      (prev) => {
        state.version();
        const L = state.logical();
        const h = state.viewH();
        const pad = o.overscanPx ?? h;
        const r = state.layout.range(L - pad, L + h + pad, o.overscan ?? DEFAULT_OVERSCAN);
        const out: string[] = [];
        for (let i = r.first; i <= r.last; i++) out.push(state.layout.keyAt(i));
        return sameKeys(prev, out) ? prev : out;
      },
      [],
    ),
    startOf: (key) => {
      state.version();
      const i = state.layout.indexOf(key);
      return i < 0 ? 0 : state.layout.startAt(i);
    },
    extent: state.extent,
    shift: state.shift,
    // To the newest loaded row's end, above any bottom runway.
    distanceFromBottom: () => (state.version(), state.logical() - state.bottomRunway),
    distanceFromTop: () => {
      // The committed extent, not the rows' total: a runway stays drawn until the scroller rests.
      const d = state.extent() - state.viewH() - state.p();
      return o.hasOlder?.() || state.committedRunway > 0 ? Math.max(1, d) : d;
    },
    lastScrollDelta: () => state.lastDelta,
    inViewKey: () => {
      state.version();
      if (state.layout.count === 0) return null;
      const L = state.logical();
      let i = state.layout.indexAt(L);
      // The newest row is cut by the bottom edge: the next older one is the newest really in view.
      if (state.layout.startAt(i) < L - 0.5 && i > 0 && state.layout.startAt(i - 1) < L + state.viewH()) i--;
      return state.layout.keyAt(i);
    },
    bottomOf: (key) => {
      state.version();
      const i = state.layout.indexOf(key);
      return i < 0 ? null : state.layout.startAt(i) - state.logical();
    },
    scrollToKey: (key, opts) => {
      if (state.layout.indexOf(key) < 0) return false;
      state.setHeldKey(null);
      m.syncViewH();
      const align = opts?.align ?? 'auto';
      const d = alignedOffset(state.layout, key, align, untrack(state.logical), untrack(state.viewH), untrack(state.endPadding));
      state.pendingNav = state.layout.measured(key) ? null : { key, align };
      if (d !== null) state.commit(d);
      state.captureAnchors();
      return true;
    },
    holdRow: (key, align = 'center') => {
      state.pendingNav = null;
      if (key === null || state.layout.indexOf(key) < 0) {
        state.setHeldKey(null);
        return false;
      }
      state.heldAlign = align;
      state.setHeldKey(key);
      m.syncViewH();
      const d = alignedOffset(state.layout, key, align, untrack(state.logical), untrack(state.viewH), untrack(state.endPadding));
      if (d !== null) state.commit(d);
      state.captureAnchors();
      return true;
    },
    holding: () => state.heldKey() !== null,
    scrollToBottom: () => {
      state.setHeldKey(null);
      state.pendingNav = null;
      state.commit(state.bottomRunway);
      state.captureAnchors();
    },
    isScrolling: state.scrolling,
    checkOlder: m.checkOlder,
    checkNewer: m.checkNewer,
    attachCanvas: (el) => {
      state.canvas = el;
    },
    observeRow: (el, key) => {
      m.elKey.set(el, key);
      m.ro?.observe(el);
      m.mounted.add(el);
      if (!m.flushQueued) {
        m.flushQueued = true;
        queueMicrotask(m.flushMounted);
      }
    },
    unobserveRow: (el) => {
      m.elKey.delete(el);
      m.mounted.delete(el);
      m.ro?.unobserve(el);
    },
  };
}
