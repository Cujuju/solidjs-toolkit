import { describe, it, expect } from 'vitest';
import {
  createClampedPosition,
  placeAgainstRect,
  DEFAULT_ANCHOR_GAP_PX,
  type AnchorRectLike,
  type KvTooltipPlacement,
} from '../clamp';

/**
 * Contract tests for anchored placement.
 *
 * These test `placeAgainstRect` — the pure kernel — rather than the reactive
 * `createClampedPosition` wrapper, because the contract IS the geometry: given
 * a rect, a panel size, and a viewport, where does the panel land? The wrapper
 * only decides which mode to route to and what to subscribe to.
 *
 * The invariant every case below asserts is the one anchored mode exists for:
 * **the panel never overlaps its own anchor.** The pre-0.2.0 clamp violated it
 * at the top edge — it hard-clamped `y` to `edgePadPx` with no flip, sliding
 * the panel down onto the element it describes.
 */

const PANEL_W = 200;
const PANEL_H = 100;
const VW = 1000;
const VH = 800;
const EDGE_PAD = 8;
const GAP = DEFAULT_ANCHOR_GAP_PX;

/** A 120x24 field somewhere in the viewport. */
function rectAt(left: number, top: number, w = 120, h = 24): AnchorRectLike {
  return { left, top, right: left + w, bottom: top + h };
}

function place(
  rect: AnchorRectLike,
  placement: KvTooltipPlacement,
  overrides: Partial<{ w: number; h: number; vw: number; vh: number }> = {},
): { x: number; y: number } {
  return placeAgainstRect({
    rect,
    w: overrides.w ?? PANEL_W,
    h: overrides.h ?? PANEL_H,
    vw: overrides.vw ?? VW,
    vh: overrides.vh ?? VH,
    placement,
    anchorGapPx: GAP,
    edgePadPx: EDGE_PAD,
  });
}

/**
 * The load-bearing assertion. Vertical separation is what keeps the tooltip
 * clear of a popover opening from the same trigger, so it is checked as a
 * strict band test, not a generic rect-intersection test.
 */
function expectNoAnchorOverlap(
  pos: { x: number; y: number },
  rect: AnchorRectLike,
  h = PANEL_H,
): void {
  const clearsAbove = pos.y + h <= rect.top;
  const clearsBelow = pos.y >= rect.bottom;
  expect(
    clearsAbove || clearsBelow,
    `panel [${pos.y}, ${pos.y + h}] overlaps anchor [${rect.top}, ${rect.bottom}]`,
  ).toBe(true);
}

describe('placeAgainstRect — happy path (rect fits on the requested side)', () => {
  const rect = rectAt(400, 400);

  it('above-start sits above the rect, left edges aligned', () => {
    const pos = place(rect, 'above-start');
    expect(pos.y).toBe(rect.top - PANEL_H - GAP);
    expect(pos.x).toBe(rect.left);
    expectNoAnchorOverlap(pos, rect);
  });

  it('below-start sits below the rect, left edges aligned', () => {
    const pos = place(rect, 'below-start');
    expect(pos.y).toBe(rect.bottom + GAP);
    expect(pos.x).toBe(rect.left);
    expectNoAnchorOverlap(pos, rect);
  });

  it('above-end sits above the rect, right edges aligned', () => {
    const pos = place(rect, 'above-end');
    expect(pos.y).toBe(rect.top - PANEL_H - GAP);
    expect(pos.x).toBe(rect.right - PANEL_W);
    expectNoAnchorOverlap(pos, rect);
  });

  it('below-end sits below the rect, right edges aligned', () => {
    const pos = place(rect, 'below-end');
    expect(pos.y).toBe(rect.bottom + GAP);
    expect(pos.x).toBe(rect.right - PANEL_W);
    expectNoAnchorOverlap(pos, rect);
  });
});

describe('placeAgainstRect — TOP edge flips above → below', () => {
  // Anchor pinned near the top: there is nowhere near enough room above for a
  // 100px panel. THIS is the case the old hard-clamp got wrong.
  const rect = rectAt(400, 10);

  it.each<KvTooltipPlacement>(['above-start', 'above-end'])(
    '%s flips to below the rect rather than clamping onto it',
    (placement) => {
      const pos = place(rect, placement);
      expect(pos.y).toBe(rect.bottom + GAP);
      expectNoAnchorOverlap(pos, rect);
      // Regression lock on the specific old bug: never the hard-clamped value.
      expect(pos.y).not.toBe(EDGE_PAD);
    },
  );

  it('below-* is unaffected near the top edge', () => {
    const pos = place(rect, 'below-start');
    expect(pos.y).toBe(rect.bottom + GAP);
    expectNoAnchorOverlap(pos, rect);
  });
});

describe('placeAgainstRect — BOTTOM edge flips below → above', () => {
  // Anchor pinned near the bottom: no room below for a 100px panel.
  const rect = rectAt(400, VH - 40);

  it.each<KvTooltipPlacement>(['below-start', 'below-end'])(
    '%s flips to above the rect',
    (placement) => {
      const pos = place(rect, placement);
      expect(pos.y).toBe(rect.top - PANEL_H - GAP);
      expectNoAnchorOverlap(pos, rect);
    },
  );

  it('above-* is unaffected near the bottom edge', () => {
    const pos = place(rect, 'above-start');
    expect(pos.y).toBe(rect.top - PANEL_H - GAP);
    expectNoAnchorOverlap(pos, rect);
  });
});

describe('placeAgainstRect — RIGHT edge switches start-align → end-align', () => {
  // Anchor's left edge is close enough to the right wall that a 200px panel
  // start-aligned to it would overflow.
  const rect = rectAt(VW - 140, 400);

  it.each<KvTooltipPlacement>(['above-start', 'below-start'])(
    '%s switches to end-align instead of jumping a full panel width',
    (placement) => {
      const pos = place(rect, placement);
      expect(pos.x).toBe(rect.right - PANEL_W);
      expect(pos.x + PANEL_W).toBeLessThanOrEqual(VW - EDGE_PAD);
      expect(pos.x).toBeGreaterThanOrEqual(EDGE_PAD);
      // The side of the rect is unchanged — only the alignment moved.
      expectNoAnchorOverlap(pos, rect);
    },
  );

  it('vertical placement is untouched by a horizontal switch', () => {
    expect(place(rect, 'above-start').y).toBe(rect.top - PANEL_H - GAP);
    expect(place(rect, 'below-start').y).toBe(rect.bottom + GAP);
  });
});

describe('placeAgainstRect — LEFT edge switches end-align → start-align', () => {
  // Anchor hugging the left wall: end-aligning a 200px panel to a rect whose
  // right edge is at 130 would put x at -70.
  const rect = rectAt(10, 400);

  it.each<KvTooltipPlacement>(['above-end', 'below-end'])(
    '%s switches to start-align instead of running off-screen',
    (placement) => {
      const pos = place(rect, placement);
      expect(pos.x).toBe(rect.left);
      expect(pos.x).toBeGreaterThanOrEqual(EDGE_PAD);
      expectNoAnchorOverlap(pos, rect);
    },
  );
});

describe('placeAgainstRect — degradation when neither side fits', () => {
  it('keeps the side with more room and stays flush (never overlaps the anchor)', () => {
    // Viewport 200 tall, anchor mid-height, panel 100 tall: neither gap fits.
    const shortVh = 200;
    const rect = rectAt(400, 120, 120, 24); // 56px above the anchor, 56px below
    const tallRect = rectAt(400, 130, 120, 24); // 130 above, 46 below
    const pos = place(tallRect, 'below-start', { vh: shortVh });
    // More room above (130 - gap - pad = 118) than below (200 - 8 - 154 - 4 = 34)
    expect(pos.y).toBe(tallRect.top - PANEL_H - GAP);
    expectNoAnchorOverlap(pos, tallRect);
    // And the symmetric case still never overlaps.
    expectNoAnchorOverlap(place(rect, 'above-start', { vh: shortVh }), rect);
  });

  it('never overlaps the anchor at any of the four edges, for every placement', () => {
    const PLACEMENTS: KvTooltipPlacement[] = [
      'above-start',
      'below-start',
      'above-end',
      'below-end',
    ];
    const EDGE_RECTS: AnchorRectLike[] = [
      rectAt(400, 0), // flush top
      rectAt(400, VH - 24), // flush bottom
      rectAt(0, 400), // flush left
      rectAt(VW - 120, 400), // flush right
      rectAt(0, 0), // top-left corner
      rectAt(VW - 120, VH - 24), // bottom-right corner
    ];
    for (const rect of EDGE_RECTS) {
      for (const placement of PLACEMENTS) {
        expectNoAnchorOverlap(place(rect, placement), rect);
      }
    }
  });
});

describe('placeAgainstRect — panel wider than the viewport allows', () => {
  it('falls back to a viewport clamp rather than an off-screen x', () => {
    const rect = rectAt(400, 400);
    const pos = place(rect, 'below-start', { w: VW + 500 });
    expect(pos.x).toBe(EDGE_PAD);
    // Vertical placement still holds the no-overlap invariant.
    expectNoAnchorOverlap(pos, rect);
  });
});

describe('placeAgainstRect — anchorGapPx', () => {
  it('is the exact separation between the anchor edge and the panel edge', () => {
    const rect = rectAt(400, 400);
    const gap = 16;
    const below = placeAgainstRect({
      rect,
      w: PANEL_W,
      h: PANEL_H,
      vw: VW,
      vh: VH,
      placement: 'below-start',
      anchorGapPx: gap,
      edgePadPx: EDGE_PAD,
    });
    expect(below.y - rect.bottom).toBe(gap);

    const above = placeAgainstRect({
      rect,
      w: PANEL_W,
      h: PANEL_H,
      vw: VW,
      vh: VH,
      placement: 'above-start',
      anchorGapPx: gap,
      edgePadPx: EDGE_PAD,
    });
    expect(rect.top - (above.y + PANEL_H)).toBe(gap);
  });

  it('defaults to the anchored-popover offset so both surfaces share one grid', () => {
    expect(DEFAULT_ANCHOR_GAP_PX).toBe(4);
  });
});

describe('createClampedPosition — anchored mode', () => {
  /** jsdom's window is 1024x768; anchored placement reads it via the shared signal. */
  const JSDOM_VH = 768;

  function anchored(getRect: () => AnchorRectLike | null): () => { x: number; y: number } {
    return createClampedPosition({
      getX: () => 0,
      getY: () => 0,
      getW: () => PANEL_W,
      getH: () => PANEL_H,
      // Absurdly large on purpose: if anchored mode consulted hysteresis at
      // all, the latch below could not release and the third assertion fails.
      hysteresisPx: 500,
      edgePadPx: EDGE_PAD,
      mouseOffsetX: 12,
      mouseOffsetY: 16,
      getAnchorRect: getRect,
      getPlacement: () => 'above-start',
    });
  }

  it('bypasses hysteresis — flips out and straight back with no latched state', () => {
    expect(JSDOM_VH).toBeGreaterThan(PANEL_H); // sanity: the roomy case is roomy
    let rect: AnchorRectLike = rectAt(400, 400);
    const pos = anchored(() => rect);

    expect(pos().y).toBe(rect.top - PANEL_H - GAP); // above, as requested

    rect = rectAt(400, 10); // flush to the top → must flip below
    expect(pos().y).toBe(rect.bottom + GAP);

    rect = rectAt(400, 400); // roomy again → must flip straight back
    expect(pos().y).toBe(rect.top - PANEL_H - GAP);
  });

  it('falls back to cursor placement when the anchor accessor returns null', () => {
    const pos = anchored(() => null);
    // Cursor mode at (0,0) with the default offsets.
    expect(pos()).toEqual({ x: 12, y: 16 });
  });
});
