import { describe, it, expect } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import {
  createRailOverflow,
  MIN_VISIBLE_RAIL_ITEMS,
  RAIL_ITEM_ATTR,
  type RailOverflow,
} from '../railOverflow';

/**
 * The rail's fit algorithm.
 *
 * jsdom has no layout engine, so every box here is stated explicitly by the test
 * (see `mount`). That is not a limitation being worked around — it is the only
 * way to assert a fit BOUNDARY, which is exactly where this algorithm is subtle
 * and where a real browser would give numbers nobody wrote down.
 *
 * What is NOT tested here: the flicker loop the module exists to prevent. That
 * loop is a property of the measure→decide→re-measure cycle over real layout, and
 * a stubbed environment cannot reproduce it. What IS tested is the structural
 * reason it cannot happen — the decision is a pure function of three inputs
 * (button extents, rail extent, trigger extent) that hiding a button cannot
 * change.
 */

/** Two macrotask turns: one for Solid to flush its effects, one for the
 *  rAF-backed measure pass the setup file maps onto `setTimeout(0)`. */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

interface Rail {
  overflow: RailOverflow;
  setIds: (ids: string[]) => void;
  /** Re-render the rail's buttons from the CURRENT visible set, as the component
   *  would. The measure pass renders everything, so this must be called after a
   *  flush for the DOM to reflect a decision. */
  render: () => void;
  dispose: () => void;
}

interface RailSpec {
  /** Button id → its extent along the rail. */
  boxes: Record<string, number>;
  railExtent: number;
  ids?: string[];
  enabled?: boolean;
}

function mount(spec: RailSpec): Rail {
  const railEl = document.createElement('div');
  Object.defineProperty(railEl, 'clientHeight', {
    get: () => spec.railExtent,
    configurable: true,
  });
  document.body.appendChild(railEl);

  const [ids, setIds] = createSignal<readonly string[]>(spec.ids ?? Object.keys(spec.boxes));

  let overflow!: RailOverflow;
  let dispose = (): void => {};

  const render = (): void => {
    railEl.replaceChildren();
    // During a measure pass every id renders — that is what makes the
    // measurement independent of its own result. `visibleIds` reports exactly
    // that set while measuring, so rendering from it is faithful either way.
    for (const id of overflow.visibleIds()) {
      const btn = document.createElement('button');
      btn.setAttribute(RAIL_ITEM_ATTR, id);
      const extent = spec.boxes[id] ?? 0;
      btn.getBoundingClientRect = () => ({ height: extent, width: 0 }) as DOMRect;
      railEl.appendChild(btn);
    }
  };

  createRoot((d) => {
    dispose = () => {
      d();
      railEl.remove();
    };
    overflow = createRailOverflow({
      railEl: () => railEl,
      ids,
      enabled: () => spec.enabled ?? true,
    });
  });

  render();
  return { overflow, setIds, render, dispose };
}

describe('createRailOverflow — fitting', () => {
  it('shows everything when the buttons fit', async () => {
    const rail = mount({ boxes: { a: 30, b: 30, c: 30 }, railExtent: 200 });
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(false);
    expect(rail.overflow.visibleIds()).toEqual(['a', 'b', 'c']);
    rail.dispose();
  });

  it('shows everything at an EXACT fit — the boundary case', async () => {
    const rail = mount({ boxes: { a: 30, b: 30, c: 30 }, railExtent: 90 });
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(false);
    rail.dispose();
  });

  it('overflows the tail once the total exceeds the rail', async () => {
    // 5×30 = 150 > 100. Trigger has not rendered, so the reserve falls back to
    // the tallest button (30) → budget 70 → two buttons fit.
    const rail = mount({ boxes: { a: 30, b: 30, c: 30, d: 30, e: 30 }, railExtent: 100 });
    await flush();
    expect(rail.overflow.visibleIds()).toEqual(['a', 'b']);
    expect(rail.overflow.overflowIds()).toEqual(['c', 'd', 'e']);
    expect(rail.overflow.hasOverflow()).toBe(true);
    rail.dispose();
  });

  it('never lets a short button jump the queue past an overflowed one', async () => {
    // Rail order is the rail's meaning. Letting `c` (tiny) slot in ahead of the
    // overflowed `b` (tall) would reorder the rail as a side effect of measuring.
    const rail = mount({ boxes: { a: 30, b: 90, c: 5, d: 5 }, railExtent: 120 });
    await flush();
    expect(rail.overflow.visibleIds()).toEqual(['a']);
    expect(rail.overflow.overflowIds()).toEqual(['b', 'c', 'd']);
    rail.dispose();
  });

  it('keeps MIN_VISIBLE_RAIL_ITEMS even when nothing fits', async () => {
    // A rail rendered as nothing but `⋯` reads as broken chrome; showing one
    // button clipped is more honest, and the clipping self-explains.
    const rail = mount({ boxes: { a: 200, b: 200 }, railExtent: 50 });
    await flush();
    expect(rail.overflow.visibleIds()).toHaveLength(MIN_VISIBLE_RAIL_ITEMS);
    expect(rail.overflow.visibleIds()).toEqual(['a']);
    rail.dispose();
  });

  it('rounds extents UP, so accumulated sub-pixel error never decides a fit', async () => {
    // 3 × 27.5 = 82.5 would "fit" 90 as floats; ceil'd to 28 each it is 84 —
    // still a fit. Push the rail to 83 and the rounded total (84) must overflow
    // even though the float total (82.5) would not.
    const rail = mount({ boxes: { a: 27.5, b: 27.5, c: 27.5 }, railExtent: 83 });
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(true);
    rail.dispose();
  });
});

describe('createRailOverflow — the trigger reserve', () => {
  it('decides WHETHER to overflow without reference to the trigger', async () => {
    // Deliberate asymmetry: if the reserve could flip this branch, refining it
    // from an estimate to a measurement would remove the trigger, which would
    // remove the reserve, which would bring the trigger back.
    const rail = mount({ boxes: { a: 40, b: 40 }, railExtent: 80 });
    await flush();
    rail.overflow.setTriggerExtent(40);
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(false);
    rail.dispose();
  });

  it('a measured trigger refines HOW MANY fit alongside it', async () => {
    // Fallback reserve is the tallest button (30) → budget 70 → 2 visible.
    const rail = mount({ boxes: { a: 30, b: 30, c: 30, d: 30 }, railExtent: 100 });
    await flush();
    expect(rail.overflow.visibleIds()).toEqual(['a', 'b']);

    // A real trigger is plainer chrome and measures smaller → budget 90 → 3 fit.
    rail.overflow.setTriggerExtent(10);
    await flush();
    expect(rail.overflow.visibleIds()).toEqual(['a', 'b', 'c']);
    rail.dispose();
  });
});

describe('createRailOverflow — enablement and invalidation', () => {
  it('renders everything when disabled, however badly it overflows', async () => {
    // The `pan` strategy wants the rail to keep scrolling.
    const rail = mount({ boxes: { a: 60, b: 60, c: 60 }, railExtent: 50, enabled: false });
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(false);
    expect(rail.overflow.visibleIds()).toEqual(['a', 'b', 'c']);
    rail.dispose();
  });

  it('re-measures when the id SET changes — a new panel has no cached extent', async () => {
    const rail = mount({
      boxes: { a: 30, b: 30, c: 30, d: 30, e: 30 },
      ids: ['a', 'b'],
      railExtent: 100,
    });
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(false);

    rail.setIds(['a', 'b', 'c', 'd', 'e']);
    // The measure pass renders everything, so the DOM must show the full set for
    // the new buttons to be measurable at all.
    rail.render();
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(true);
    rail.dispose();
  });

  it('remeasure() re-runs the pass for a layout change no observer sees', async () => {
    const rail = mount({ boxes: { a: 30, b: 30 }, railExtent: 100 });
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(false);
    expect(() => rail.overflow.remeasure()).not.toThrow();
    await flush();
    expect(rail.overflow.hasOverflow()).toBe(false);
    rail.dispose();
  });

  it('reports everything visible before the first measure lands', async () => {
    // The pre-measure state must be "show all", never "show none" — a rail that
    // starts empty flashes on every mount.
    const rail = mount({ boxes: { a: 200, b: 200 }, railExtent: 50 });
    expect(rail.overflow.visibleIds()).toEqual(['a', 'b']);
    await flush();
    rail.dispose();
  });
});
