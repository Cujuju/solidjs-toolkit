import { describe, it, expect } from 'vitest';
import {
  resolvePopoutPosition,
  POPOUT_VIEWPORT_MARGIN_PX,
  POPOUT_DEFAULT_GAP_PX,
} from '../_internal/popout';

/** A 1000x800 viewport, and a 120x28 panel — a picker's real proportions. */
const VIEWPORT = { width: 1000, height: 800 };
const PANEL = { width: 120, height: 28 };
const anchorAt = (top: number, left: number) => ({ top, left, width: 40, height: 20 });

describe('resolvePopoutPosition', () => {
  it('opens ABOVE the anchor when there is room', () => {
    // Above is preferred: a panel below would cover the NEXT row, which in a list of
    // legs is the row the user is most likely to reach for next.
    const p = resolvePopoutPosition(anchorAt(400, 100), PANEL, VIEWPORT);
    expect(p.placement).toBe('top');
    expect(p.top).toBe(400 - PANEL.height - POPOUT_DEFAULT_GAP_PX);
  });

  it('flips BELOW when the anchor is too near the top to fit above', () => {
    // The first row of a rail is exactly this case, and it is not an edge case.
    const anchor = anchorAt(10, 100);
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT);
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(anchor.top + anchor.height + POPOUT_DEFAULT_GAP_PX);
  });

  it('flips back ABOVE when the anchor is too near the bottom to fit below', () => {
    const p = resolvePopoutPosition(anchorAt(770, 100), PANEL, VIEWPORT);
    expect(p.placement).toBe('top');
  });

  it('left-aligns to the anchor', () => {
    expect(resolvePopoutPosition(anchorAt(400, 250), PANEL, VIEWPORT).left).toBe(250);
  });

  it('clamps a right-edge anchor so the panel stays on screen', () => {
    // The panel is WIDER than its anchor — it carries the +/- the anchor was hiding —
    // so an anchor flush right would push it off the viewport if left-aligned naively.
    const p = resolvePopoutPosition(anchorAt(400, 980), PANEL, VIEWPORT);
    expect(p.left).toBe(VIEWPORT.width - PANEL.width - POPOUT_VIEWPORT_MARGIN_PX);
    expect(p.left + PANEL.width).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it('clamps a left-edge anchor to the margin, never off-screen', () => {
    expect(resolvePopoutPosition(anchorAt(400, -30), PANEL, VIEWPORT).left).toBe(
      POPOUT_VIEWPORT_MARGIN_PX,
    );
  });

  it('keeps the TOP edge on screen when the panel fits on NEITHER side', () => {
    // Losing the bottom of the panel is survivable — the value and the first button are
    // still reachable. Losing the top means the control is simply gone.
    const tall = { width: 120, height: 700 };
    const p = resolvePopoutPosition(anchorAt(400, 100), tall, { width: 1000, height: 500 });
    expect(p.top).toBeGreaterThanOrEqual(POPOUT_VIEWPORT_MARGIN_PX);
  });

  it('picks the side with MORE room when neither side fits', () => {
    const tall = { width: 120, height: 400 };
    // Anchor low: more room above than below.
    expect(resolvePopoutPosition(anchorAt(300, 100), tall, { width: 1000, height: 380 }).placement)
      .toBe('top');
    // Anchor high: more room below than above.
    expect(resolvePopoutPosition(anchorAt(40, 100), tall, { width: 1000, height: 380 }).placement)
      .toBe('bottom');
  });

  it('honours a custom gap', () => {
    const p = resolvePopoutPosition(anchorAt(400, 100), PANEL, VIEWPORT, 12);
    expect(p.top).toBe(400 - PANEL.height - 12);
  });
});
