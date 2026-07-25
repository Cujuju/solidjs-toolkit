import { describe, it, expect, vi } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { createResize, DEFAULT_MIN_SIZE_PX, type ResizeApi, type ResizeHost } from '../resize';

/**
 * The splitter engine, driven through real pointer events.
 *
 * The two properties worth protecting are both CONSERVATION properties, and both
 * are things the naive implementation gets wrong:
 *
 *   1. A drag moves a boundary — the pair's total never changes. The naive "just
 *      set this panel's width" version makes the dock overflow or leaves a gap.
 *   2. Clamping happens BEFORE the delta is applied, against both floors at once.
 *      Clamping after the fact is what produces the classic "the other panel keeps
 *      shrinking past its minimum" bug.
 */

/** Overdrag distance past a floor that commits a collapse. Mirrors the module's
 *  private COLLAPSE_OVERDRAG_PX; if that value moves, these tests should fail. */
const COLLAPSE_OVERDRAG_PX = 40;

interface Harness {
  api: ResizeApi;
  sizes: () => Readonly<Record<string, number>>;
  collapsed: string[];
  dispose: () => void;
}

interface HarnessSpec {
  /** Open ids in visual order, with the extent each element reports. */
  boxes: Record<string, number>;
  ids?: string[];
  axis?: 'x' | 'y';
  direction?: 1 | -1;
  minSizes?: Record<string, number>;
  /** Ids that refuse to collapse (a leaf, or a consumer-controlled pane). */
  uncollapsible?: string[];
}

function harness(spec: HarnessSpec): Harness {
  const ids = spec.ids ?? Object.keys(spec.boxes);
  const axis = spec.axis ?? 'x';
  const collapsed: string[] = [];

  const els = new Map<string, HTMLElement>();
  for (const id of ids) {
    const el = document.createElement('div');
    const extent = spec.boxes[id];
    // jsdom has no layout — every rect is zero. The engine seeds from the DOM at
    // drag start, so the sizes it starts from must be stated by the test.
    el.getBoundingClientRect = () =>
      ({ width: axis === 'x' ? extent : 0, height: axis === 'y' ? extent : 0 }) as DOMRect;
    els.set(id, el);
  }

  let dispose = (): void => {};
  let api!: ResizeApi;
  let sizes!: () => Readonly<Record<string, number>>;

  createRoot((d) => {
    dispose = d;
    const [sizeMap, setSizeMap] = createSignal<Readonly<Record<string, number>>>({});
    sizes = sizeMap;
    const host: ResizeHost = {
      axis: () => axis,
      direction: () => spec.direction ?? 1,
      visualOpenIds: () => ids,
      elementOf: (id) => els.get(id),
      minSizeOf: (id) => spec.minSizes?.[id] ?? DEFAULT_MIN_SIZE_PX,
      sizes: sizeMap,
      setSizes: setSizeMap,
      collapse: (id) => {
        if (spec.uncollapsible?.includes(id) === true) return false;
        collapsed.push(id);
        return true;
      },
      canCollapse: (id) => spec.uncollapsible?.includes(id) !== true,
    };
    api = createResize(host);
  });

  return { api, sizes, collapsed, dispose };
}

/** A pointerdown on a splitter. `currentTarget` is what the engine captures on. */
function down(api: ResizeApi, id: string, at: number, axis: 'x' | 'y' = 'x'): void {
  const el = document.createElement('div');
  const e = new PointerEvent('pointerdown', {
    clientX: axis === 'x' ? at : 0,
    clientY: axis === 'y' ? at : 0,
    bubbles: true,
  });
  Object.defineProperty(e, 'currentTarget', { value: el, configurable: true });
  api.begin(id, e);
}

function move(to: number, axis: 'x' | 'y' = 'x'): void {
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: axis === 'x' ? to : 0,
      clientY: axis === 'y' ? to : 0,
      bubbles: true,
    }),
  );
}

function up(): void {
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}

describe('createResize — the conservation property', () => {
  it('moves the boundary: one panel grows by exactly what the other loses', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    down(h.api, 'a', 0);
    move(50);
    expect(h.sizes()).toMatchObject({ a: 350, b: 250 });
    up();
    h.dispose();
  });

  it('seeds EVERY open panel, not just the dragged pair', () => {
    // Panels left on automatic sizing would re-flow to absorb the delta, and the
    // boundary the user grabbed would appear not to move.
    const h = harness({ boxes: { a: 200, b: 200, c: 200 } });
    down(h.api, 'a', 0);
    expect(h.sizes()).toMatchObject({ a: 200, b: 200, c: 200 });
    up();
    h.dispose();
  });

  it('conserves the pair total at every step of a long drag', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    down(h.api, 'a', 0);
    for (const x of [10, 90, -120, 400, -400, 0]) {
      move(x);
      const s = h.sizes();
      expect(s.a + s.b).toBe(600);
    }
    up();
    h.dispose();
  });

  it('drags on the y axis when the group is vertical', () => {
    const h = harness({ boxes: { a: 300, b: 300 }, axis: 'y' });
    down(h.api, 'a', 0, 'y');
    move(-40, 'y');
    expect(h.sizes()).toMatchObject({ a: 260, b: 340 });
    up();
    h.dispose();
  });

  it('mirrors the delta when direction is -1 (rail docked right)', () => {
    const h = harness({ boxes: { a: 300, b: 300 }, direction: -1 });
    down(h.api, 'a', 0);
    move(50);
    // Pointer moved right, but the axis is mirrored, so the dragged panel shrinks.
    expect(h.sizes()).toMatchObject({ a: 250, b: 350 });
    up();
    h.dispose();
  });
});

describe('createResize — clamping', () => {
  it('stops the dragged panel at its own floor', () => {
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(-1000);
    expect(h.sizes()).toMatchObject({ a: 100, b: 500 });
    up();
    h.dispose();
  });

  it('stops the NEIGHBOUR at its floor — the bug that clamping-after-the-fact causes', () => {
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(1000);
    expect(h.sizes()).toMatchObject({ a: 500, b: 100 });
    up();
    h.dispose();
  });

  it('uses DEFAULT_MIN_SIZE_PX when a panel declares no minimum', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    down(h.api, 'a', 0);
    move(1000);
    expect(h.sizes().b).toBe(DEFAULT_MIN_SIZE_PX);
    up();
    h.dispose();
  });

  it('is a no-op on the LAST panel — there is no neighbour to take from', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    down(h.api, 'b', 0);
    expect(h.api.resizing()).toBe(false);
    expect(h.sizes()).toEqual({});
    h.dispose();
  });
});

describe('createResize — overdrag collapse', () => {
  it('does not flag a collapse merely for reaching the floor', () => {
    // A panel clamped at its minimum still sits under a moving pointer; a 1px
    // trigger would collapse panels every time someone dragged firmly to the edge.
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(-200 - (COLLAPSE_OVERDRAG_PX - 10));
    expect(h.api.collapseCandidate()).toBeNull();
    up();
    expect(h.collapsed).toEqual([]);
    h.dispose();
  });

  it('flags the dragged panel once the pointer travels past the floor by the overdrag', () => {
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(-200 - (COLLAPSE_OVERDRAG_PX + 10));
    expect(h.api.collapseCandidate()).toBe('a');
    h.dispose();
  });

  it('flags the NEIGHBOUR when dragged the other way', () => {
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(200 + COLLAPSE_OVERDRAG_PX + 10);
    expect(h.api.collapseCandidate()).toBe('b');
    h.dispose();
  });

  it('commits on RELEASE, not mid-drag', () => {
    // Collapsing mid-drag would yank the boundary out from under the pointer.
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(-400);
    expect(h.collapsed).toEqual([]);
    up();
    expect(h.collapsed).toEqual(['a']);
    expect(h.api.collapseCandidate()).toBeNull();
    h.dispose();
  });

  it('is retractable — dragging back before release cancels it', () => {
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(-400);
    expect(h.api.collapseCandidate()).toBe('a');
    move(0);
    expect(h.api.collapseCandidate()).toBeNull();
    up();
    expect(h.collapsed).toEqual([]);
    h.dispose();
  });

  it('drops the collapsed panel’s explicit size, so it reopens at the mode’s size', () => {
    // Not the 1px sliver the user squashed it to.
    const h = harness({ boxes: { a: 300, b: 300 }, minSizes: { a: 100, b: 100 } });
    down(h.api, 'a', 0);
    move(-400);
    up();
    expect(h.sizes()).not.toHaveProperty('a');
    expect(h.sizes()).toHaveProperty('b');
    h.dispose();
  });

  it('never flags a panel that refuses to collapse — the drag just clamps', () => {
    const h = harness({
      boxes: { a: 300, b: 300 },
      minSizes: { a: 100, b: 100 },
      uncollapsible: ['a'],
    });
    down(h.api, 'a', 0);
    move(-400);
    expect(h.api.collapseCandidate()).toBeNull();
    up();
    expect(h.collapsed).toEqual([]);
    expect(h.sizes()).toMatchObject({ a: 100, b: 500 });
    h.dispose();
  });
});

describe('createResize — lifecycle', () => {
  it('reports resizing across the drag and clears it on release', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    expect(h.api.resizing()).toBe(false);
    down(h.api, 'a', 0);
    expect(h.api.resizing()).toBe(true);
    up();
    expect(h.api.resizing()).toBe(false);
    h.dispose();
  });

  it('stops listening after release — a stray pointermove must not resize', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    down(h.api, 'a', 0);
    move(50);
    up();
    const settled = { ...h.sizes() };
    move(500);
    expect(h.sizes()).toEqual(settled);
    h.dispose();
  });

  it('treats pointercancel as a release', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    down(h.api, 'a', 0);
    move(50);
    window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    expect(h.api.resizing()).toBe(false);
    h.dispose();
  });

  it('claims the pointer so the drag survives leaving the splitter', () => {
    const h = harness({ boxes: { a: 300, b: 300 } });
    const el = document.createElement('div');
    const setPointerCapture = vi.fn();
    Object.assign(el, { setPointerCapture, releasePointerCapture: vi.fn() });
    const e = new PointerEvent('pointerdown', { clientX: 0, bubbles: true });
    Object.defineProperty(e, 'currentTarget', { value: el, configurable: true });
    h.api.begin('a', e);
    expect(setPointerCapture).toHaveBeenCalledTimes(1);
    up();
    h.dispose();
  });
});
