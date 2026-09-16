import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import { createAfterPaint, createResizeObserver } from '@cujuju/solidjs-hooks';

/**
 * Deciding which rail buttons FIT, so the rest collapse into a `⋯` menu. Measuring happens
 * only during a MEASURE PASS. See DESIGN_NOTES.md § src/railOverflow.ts:4.
 */

/**
 * Attribute the rail's buttons carry, so measurements bind to a panel by IDENTITY rather than
 * position — index mapping is one reorder away from the wrong button collapsing.
 */
export const RAIL_ITEM_ATTR = 'data-panel-id';

/** Marks the `⋯` trigger so it is never mistaken for a panel button. */
export const RAIL_OVERFLOW_ATTR = 'data-rail-overflow';

/**
 * Everything in the rail that is a CONTROL rather than background. Exported as a finished
 * selector because `railPan` consumes it too. See DESIGN_NOTES.md § src/railOverflow.ts:39.
 */
export const RAIL_CONTROL_SELECTOR = `[${RAIL_ITEM_ATTR}], [${RAIL_OVERFLOW_ATTR}]`;

/**
 * The rail always keeps at least this many buttons. One: a rail rendered as nothing but a `⋯`
 * reads as broken chrome.
 */
export const MIN_VISIBLE_RAIL_ITEMS = 1;

export interface RailOverflowOptions {
  /** The rail element. */
  railEl: Accessor<HTMLElement | undefined>;
  /** Panel ids in RAIL ORDER — the same sequence the rail renders. */
  ids: Accessor<readonly string[]>;
  /** Turn the whole mechanism off (e.g. under `pan`, where the rail keeps scrolling). Defaults
   *  to on. */
  enabled?: Accessor<boolean>;
}

export interface RailOverflow {
  /** Ids the rail should render as buttons. */
  visibleIds: Accessor<readonly string[]>;
  /** Ids that did not fit, for the `⋯` menu. */
  overflowIds: Accessor<readonly string[]>;
  hasOverflow: Accessor<boolean>;
  /** The `⋯` trigger reports its own measured extent here — see `reserve`. */
  setTriggerExtent: (px: number | undefined) => void;
  /** Force a measure pass. Escape hatch for a layout change no observer sees. */
  remeasure: () => void;
}

/**
 * Extents are rounded UP: sub-pixel accumulation would otherwise decide a fit by a fraction
 * of a pixel, which is the boundary case that flickers.
 */
function extentOf(el: Element): number {
  return Math.ceil(el.getBoundingClientRect().height);
}

/** Value equality for the size cache, so a measure pass that finds nothing changed emits no
 *  new signal value. */
function sameSizes(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export function createRailOverflow(options: RailOverflowOptions): RailOverflow {
  const enabled = (): boolean => options.enabled?.() ?? true;

  const [sizes, setSizes] = createSignal<ReadonlyMap<string, number>>(new Map(), {
    equals: sameSizes,
  });
  const [railExtent, setRailExtent] = createSignal(0);
  const [triggerExtent, setTriggerExtent] = createSignal<number | undefined>(undefined);
  /** While true every id is rendered, so a measure pass sees real boxes for all
   *  of them rather than zeros for the hidden ones. */
  const [measuring, setMeasuring] = createSignal(true);

  const afterPaint = createAfterPaint();
  const scheduleMeasure = (): void => {
    setMeasuring(true);
  };

  /**
   * Fallback reserve for the `⋯` trigger, used only on the first frame in which overflow
   * appears. A measurement rather than a constant, so density and font changes move it.
   */
  const fallbackReserve = (s: ReadonlyMap<string, number>): number => {
    let max = 0;
    for (const v of s.values()) if (v > max) max = v;
    return max;
  };

  const layout = createMemo<{ visible: readonly string[]; overflow: readonly string[] }>(() => {
    const all = options.ids();
    // During a measure pass, and whenever the feature is off, everything renders.
    // This is what makes the measurement independent of its own result.
    if (!enabled() || measuring()) return { visible: all, overflow: [] };

    const extent = railExtent();
    const s = sizes();
    if (extent <= 0 || s.size === 0) return { visible: all, overflow: [] };

    let total = 0;
    for (const id of all) total += s.get(id) ?? 0;

    // WHETHER there is a trigger is decided WITHOUT reference to its size: otherwise refining
    // the reserve would remove the trigger, then bring it back.
    if (total <= extent) return { visible: all, overflow: [] };

    const budget = Math.max(0, extent - (triggerExtent() ?? fallbackReserve(s)));
    const visible: string[] = [];
    const overflow: string[] = [];
    let used = 0;
    for (const id of all) {
      const h = s.get(id) ?? 0;
      const fits = used + h <= budget;
      // Once anything has overflowed, everything after it does too: letting a short button jump
      // the queue would reorder the rail as a side effect of measurement.
      if (overflow.length === 0 && (fits || visible.length < MIN_VISIBLE_RAIL_ITEMS)) {
        visible.push(id);
        used += h;
      } else {
        overflow.push(id);
      }
    }
    return { visible, overflow };
  });

  // ── Measurement ────────────────────────────────────────────────────────────

  const measureNow = (): void => {
    const rail = options.railEl();
    if (rail === undefined) return;
    const next = new Map<string, number>();
    for (const el of rail.querySelectorAll(`[${RAIL_ITEM_ATTR}]`)) {
      const id = el.getAttribute(RAIL_ITEM_ATTR);
      if (id === null) continue;
      next.set(id, extentOf(el));
    }
    setSizes(next);
    setRailExtent(rail.clientHeight);
    setMeasuring(false);
  };

  createEffect(() => {
    if (!measuring()) return;
    // After paint, so the "render everything" pass has actually laid out.
    afterPaint(measureNow);
  });

  // A change to the id SET is the one invalidation no size observer sees: a newly-registered
  // panel has no cached extent at all.
  createEffect(() => {
    options.ids();
    scheduleMeasure();
  });

  // The rail's own box: the group resizing, or the dock changing height.
  createResizeObserver(options.railEl, (entry) => {
    if (Math.ceil(entry.target.clientHeight) === railExtent()) return;
    scheduleMeasure();
  });

  /**
   * Per-button observation, robust to a density change or a late font load. The guard matters:
   * `observe()` fires immediately, so re-observing would re-enter the measure pass.
   */
  createEffect(() => {
    const rail = options.railEl();
    // Re-observe whatever is currently rendered.
    layout().visible;
    if (rail === undefined || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      const cached = sizes();
      for (const entry of entries) {
        const id = entry.target.getAttribute(RAIL_ITEM_ATTR);
        if (id === null) continue;
        if (cached.get(id) !== extentOf(entry.target)) {
          scheduleMeasure();
          return;
        }
      }
    });
    for (const el of rail.querySelectorAll(`[${RAIL_ITEM_ATTR}]`)) ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  return {
    visibleIds: () => layout().visible,
    overflowIds: () => layout().overflow,
    hasOverflow: () => layout().overflow.length > 0,
    setTriggerExtent,
    remeasure: scheduleMeasure,
  };
}
