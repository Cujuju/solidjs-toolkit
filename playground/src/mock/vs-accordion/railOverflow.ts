import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import { createAfterPaint, createResizeObserver } from '@cujuju/solidjs-hooks';

/**
 * MOCK — same status as the rest of this directory.
 *
 * Deciding which rail buttons FIT, so the ones that do not can collapse into a
 * `⋯` menu instead of summoning a scrollbar into a 40px strip.
 *
 * WHY THIS IS NOT JUST `scrollHeight > clientHeight`
 *
 * The naive version of this feature measures the rail, hides the tail, and then
 * re-measures — at which point the rail no longer overflows, so the tail comes
 * back, so it overflows again. That flicker loop is the entire difficulty of an
 * overflow menu, and it is structural: the measurement's input depends on the
 * decision the measurement produces.
 *
 * The fix here is to break that dependency rather than damp it. Measurement only
 * ever happens during a MEASURE PASS, in which every button is rendered (see
 * `measuring`); the fit decision is then a pure function of inputs that no longer
 * move — each button's own extent, the rail's extent, and the trigger's extent.
 * Hiding buttons cannot change any of those three, so the decision cannot feed
 * back into its own inputs. Convergence is not a tuning problem; there is nothing
 * to tune.
 */

/**
 * Attribute the rail's buttons must carry, so measurements bind to a panel by
 * IDENTITY rather than by position.
 *
 * Index-based mapping (nth child ↔ nth id) would be one reorder away from
 * silently attributing one panel's height to another, and the symptom — the wrong
 * button collapsing into the menu — looks like a measurement bug rather than a
 * mapping bug. See the wiring note in this phase's handoff.
 */
export const RAIL_ITEM_ATTR = 'data-panel-id';

/** Marks the `⋯` trigger so it is never mistaken for a panel button. */
export const RAIL_OVERFLOW_ATTR = 'data-rail-overflow';

/**
 * The rail always keeps at least this many buttons.
 *
 * One. A rail rendered as nothing but a `⋯` reads as broken chrome rather than as
 * a dense rail — the user loses the "this is a strip of panels" affordance
 * entirely, and the menu becomes primary navigation by accident. If even a single
 * button genuinely cannot fit, showing it clipped is more honest than showing
 * none: the clipping is visible and self-explaining.
 */
export const MIN_VISIBLE_RAIL_ITEMS = 1;

export interface RailOverflowOptions {
  /** The rail element. */
  railEl: Accessor<HTMLElement | undefined>;
  /** Panel ids in RAIL ORDER — the same sequence the rail renders. */
  ids: Accessor<readonly string[]>;
  /** Turn the whole mechanism off (e.g. under the `pan` strategy, where the rail
   *  is meant to keep scrolling). Defaults to on. */
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
 * Extents are rounded UP.
 *
 * Sub-pixel layout means a button can measure 27.5px and two of them 55.0px; a
 * floor or a raw float lets accumulated error decide a fit by a fraction of a
 * pixel, which is exactly the boundary case that produces a one-frame flicker.
 * Rounding up is the conservative direction: the fit is under-estimated, so the
 * failure mode is "one fewer button than strictly possible", never "one button
 * clipped".
 */
function extentOf(el: Element): number {
  return Math.ceil(el.getBoundingClientRect().height);
}

/** Value equality for the size cache, so a measure pass that finds nothing
 *  changed does not emit a new signal value and re-trigger downstream work. */
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
   * Fallback reserve for the `⋯` trigger, used only on the very first frame in
   * which overflow appears and the trigger has therefore not rendered yet.
   *
   * The tallest measured button is a deliberate OVER-estimate: the trigger is
   * plainer chrome than a labelled button, so reserving a button's worth of space
   * can only under-fill the rail, never clip. It is a measurement rather than a
   * constant so that a density change or a font swap moves it automatically —
   * a hardcoded px here would be a second, silently-drifting copy of a value the
   * stylesheet already owns.
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

    // WHETHER there is a trigger is decided here, WITHOUT reference to the
    // trigger's own size. That asymmetry is deliberate: if the reserve could flip
    // this branch, refining the reserve from an estimate to a measurement could
    // remove the trigger, which would remove the reserve, which would bring the
    // trigger back. Reserve influences only HOW MANY buttons fit alongside it.
    if (total <= extent) return { visible: all, overflow: [] };

    const budget = Math.max(0, extent - (triggerExtent() ?? fallbackReserve(s)));
    const visible: string[] = [];
    const overflow: string[] = [];
    let used = 0;
    for (const id of all) {
      const h = s.get(id) ?? 0;
      const fits = used + h <= budget;
      // Once anything has overflowed, everything after it does too — the rail is
      // a sequence, and letting a short button "jump the queue" past a tall one
      // would reorder the rail as a side effect of measurement.
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

  // A change to the id SET is the one invalidation no size observer can see: a
  // newly-registered panel has no cached extent at all.
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
   * Per-button observation, which is what makes this robust to a density change
   * or a late font load: both alter a button's box, and neither fires any other
   * signal this module could listen to.
   *
   * The guard is the important part. `ResizeObserver.observe()` delivers an
   * immediate callback for every element it starts watching, so re-observing
   * after each render would re-enter the measure pass forever. Comparing against
   * the cached extent turns that burst into a no-op and leaves only genuine size
   * changes to trigger work — the same reason a measure pass that finds nothing
   * changed emits no new `sizes` value.
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
