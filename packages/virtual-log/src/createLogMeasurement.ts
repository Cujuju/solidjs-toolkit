import { batch, createEffect, createMemo, on, untrack } from 'solid-js';
import { safeResizeObserver, blockSize, toDevicePx } from './_internal/dom';

import { NEWER_LOOKAHEAD_VIEWPORTS } from './_internal/constants';
import type { VirtualLogOptions } from './types';
import type { createLogLayout } from './createLogLayout';

export function createLogMeasurement<R>(o: VirtualLogOptions<R>, s: ReturnType<typeof createLogLayout<R>>) {
  // Rows: sizes stay with their keys; the anchors captured before the change say where the view goes.
  const keyList = createMemo(() => o.rows().map(s.getKey));
  createEffect(
    on(keyList, (keys) => {
      s.rowsNow = untrack(o.rows);
      s.layout.setKeys(keys);
      const held = untrack(s.heldKey);
      if (held !== null && s.layout.indexOf(held) < 0) s.setHeldKey(null);
      if (s.pendingNav && s.layout.indexOf(s.pendingNav.key) < 0) s.pendingNav = null;
      s.relayout();
    }),
  );
  createEffect(
    on(s.endPadding, (pad) => {
      s.noteEndBeforeChange();
      s.layout.setEndPadding(pad + s.bottomRunway);
      s.relayout();
    }, { defer: true }),
  );
  if (o.layoutKey) createEffect(on(o.layoutKey, () => s.layout.invalidate(), { defer: true }));
  // Keeps the runway in step with hasOlder once at rest.
  if (o.hasOlder) createEffect(on(o.hasOlder, () => !s.busy() && s.relayout(), { defer: true }));
  if (o.hasNewer) createEffect(on(o.hasNewer, () => !s.busy() && s.relayout(), { defer: true }));

  // Measurement: rows report their border-box height; one batch, one relayout.
  const elKey = new Map<Element, string>();
  const measureOne = (el: Element, h: number): boolean => {
    const key = elKey.get(el);
    // Hidden, every row reads 0: kept sizes stay until it shows again.
    return key !== undefined && !s.hidden() && s.layout.setSize(key, toDevicePx(h));
  };
  /** A navigation refines until its row is measured, even at exactly its estimate (no size change to relayout on). */
  const navMeasured = (): boolean => s.pendingNav !== null && s.layout.measured(s.pendingNav.key);
  let mounted = new Set<HTMLElement>();
  let flushQueued = false;
  // Rows drawn in a resize observer callback are observed only next frame; measured here, before paint.
  const flushMounted = (): void => {
    flushQueued = false;
    if (!s.alive) return;
    const els = mounted;
    mounted = new Set();
    let changed = false;
    for (const el of els) if (el.isConnected) changed = measureOne(el, el.getBoundingClientRect().height) || changed;
    if (changed || navMeasured()) s.relayout();
  };
  // Created with the log, not a row: its cleanup belongs to the log's owner.
  const ro = safeResizeObserver((entries) => {
    let changed = false;
    for (const e of entries) {
      if (e.target === s.scroller) viewport();
      else changed = measureOne(e.target, blockSize(e)) || changed;
    }
    if (changed || navMeasured()) s.relayout();
  });

  /** Navigation can run before the ResizeObserver reports a height (a ref may have cached 0): align with the live one. */
  const syncViewH = (): void => {
    if (!s.hidden()) s.setViewH(s.scroller!.clientHeight);
  };

  const viewport = (): void => {
    // Hidden: keep the last view (and its anchors); the browser restores the offset when it shows again.
    if (!s.scroller) return;
    if (s.hidden()) {
      s.wasHidden = true;
      return;
    }
    const w = s.scroller.clientWidth;
    if (s.width > 0 && w !== s.width) s.layout.invalidate();
    s.width = w;
    const shown = s.wasHidden;
    s.wasHidden = false;
    s.noteEndBeforeChange();
    batch(() => {
      s.setViewH(s.scroller!.clientHeight);
      // Adopt the native offset after resize. At rest the bottom holds; interrupted following returns to the newest row when scrolling settles.
      s.setP(s.native());
      // Shown again: rows that came or grew while hidden are placed by the anchors from before it hid.
      if (!shown) s.captureAnchors();
    });
    // The runway is sized by the viewport, and rows may have changed while hidden: recommit at rest.
    if (!s.busy()) s.relayout();
    else void checkEdges();
  };

  let inflightNewer: Promise<void> | null = null;
  const checkNewer = (): Promise<void> => {
    if (inflightNewer) return inflightNewer;
    if (!s.alive || !o.loadNewer || !o.hasNewer?.() || !s.scroller || s.hidden() || s.layout.count === 0) return Promise.resolve();
    const L = untrack(s.logical);
    const near = s.layout.count - 1 - s.layout.indexAt(L) <= s.threshold || L - s.bottomRunway < NEWER_LOOKAHEAD_VIEWPORTS * untrack(s.viewH);
    if (!near) return Promise.resolve();
    const before = s.layout.count;
    inflightNewer = o.loadNewer().then(
      () => {
        inflightNewer = null;
        // Rows came: check both ends again. None: this end waits for the next scroll; the other may be due.
        queueMicrotask(() => (s.layout.count !== before ? checkEdges() : void checkOlder()));
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
    if (!s.alive || !o.loadOlder || !s.scroller || s.hidden() || s.layout.count === 0 || (o.hasOlder && !o.hasOlder())) return Promise.resolve();
    const topEdge = untrack(s.logical) + untrack(s.viewH);
    const near = s.layout.indexAt(topEdge) <= s.threshold || s.layout.total() - topEdge < 2 * untrack(s.viewH);
    if (!near) return Promise.resolve();
    const before = s.layout.count;
    const done = (): void => {
      inflight = null;
    };
    inflight = o.loadOlder().then(
      () => {
        done();
        // Rows arrived: maybe still near the top (a short page). None: stop until the next scroll.
        queueMicrotask(() => (s.layout.count !== before ? checkEdges() : void checkNewer()));
      },
      done,
    );
    return inflight;
  };

  return {
    keyList, elKey, flushMounted, ro, syncViewH, checkOlder, checkNewer, checkEdges,
    get mounted() { return mounted; },
    get flushQueued() { return flushQueued; },
    set flushQueued(value: boolean) { flushQueued = value; },
  };
}
