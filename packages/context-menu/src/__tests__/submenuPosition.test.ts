import { describe, it, expect } from 'vitest';
import type { FloatingBounds } from '@cujuju/solidjs-hooks';
import {
  computeSubmenuStyle,
  VIEWPORT_MARGIN_PX,
  SCROLLABLE_SUBMENU_MAX_VH,
  POPOVER_PARENT_UNDER_OVERLAP_PX,
  type SubmenuStyleInput,
} from '../submenuPosition.js';

const VW = 1000;
const VH = 800;
const FULL: FloatingBounds = { top: 0, left: 0, right: VW, bottom: VH, width: VW, height: VH };
/** A host title bar reserving the top 48px. */
const TITLE_BAR_PX = 48;
const BELOW_TITLE_BAR: FloatingBounds = { ...FULL, top: TITLE_BAR_PX, height: VH - TITLE_BAR_PX };

/** A parent menu sitting at x:100..300, with a 200×400 submenu. */
function base(overrides: Partial<SubmenuStyleInput> = {}): SubmenuStyleInput {
  return {
    triggerRect: { top: 120 },
    parentRect: { left: 100, right: 300 },
    flyoutRect: { width: 200, height: 400 },
    bounds: FULL,
    scrollable: false,
    ...overrides,
  };
}

const px = (v: string): number => parseFloat(v);

describe('computeSubmenuStyle', () => {
  it('opens to the right of the parent, tucked under by the overlap', () => {
    const s = computeSubmenuStyle(base());
    // parentRect.right (300) - overlap (3)
    expect(px(s.left)).toBe(300 - POPOVER_PARENT_UNDER_OVERLAP_PX);
  });

  it('flips to the left when the right side has no room', () => {
    // Parent hugs the right edge — no room for a 200px flyout right.
    const s = computeSubmenuStyle(
      base({ parentRect: { left: VW - 250, right: VW - 50 } }),
    );
    // parentRect.left - flyout.width + overlap
    expect(px(s.left)).toBe(VW - 250 - 200 + POPOVER_PARENT_UNDER_OVERLAP_PX);
  });

  it('when neither side fits, picks the side with more free space', () => {
    // Flyout wider than either gap; parent left-of-center → more room
    // on the right, so it opens right (then the clamp pulls it in).
    const wide = computeSubmenuStyle(
      base({
        parentRect: { left: 380, right: 420 },
        flyoutRect: { width: 700, height: 400 },
      }),
    );
    // rightRoom (1000-420=580) >= leftRoom (380) → right side chosen,
    // then clamped to viewportW - width - margin.
    expect(px(wide.left)).toBe(VW - 700 - VIEWPORT_MARGIN_PX);
  });

  it('clamps left to the viewport margin', () => {
    // Parent at the far left, flyout flips left → negative left, clamped.
    const s = computeSubmenuStyle(
      base({ parentRect: { left: 20, right: 60 }, flyoutRect: { width: 400, height: 400 } }),
    );
    expect(px(s.left)).toBeGreaterThanOrEqual(VIEWPORT_MARGIN_PX);
  });

  it('aligns top with the trigger when it fits', () => {
    const s = computeSubmenuStyle(base({ triggerRect: { top: 200 } }));
    expect(px(s.top)).toBe(200 - VIEWPORT_MARGIN_PX);
  });

  it('shifts up when the flyout would overflow the bottom', () => {
    // Trigger near the bottom; 400px flyout would run off.
    const s = computeSubmenuStyle(base({ triggerRect: { top: 700 } }));
    expect(px(s.top)).toBe(VH - 400 - VIEWPORT_MARGIN_PX);
  });

  it('clamps top to the viewport margin', () => {
    const s = computeSubmenuStyle(base({ triggerRect: { top: -50 } }));
    expect(px(s.top)).toBe(VIEWPORT_MARGIN_PX);
  });

  it('never starts inside a host-reserved top edge, even when taller than the bounds', () => {
    const s = computeSubmenuStyle(base({
      bounds: BELOW_TITLE_BAR, triggerRect: { top: 300 }, flyoutRect: { width: 200, height: VH * 2 },
    }));
    expect(px(s.top)).toBe(TITLE_BAR_PX + VIEWPORT_MARGIN_PX);
    expect(s['max-height']).toBe(`${VH - TITLE_BAR_PX - VIEWPORT_MARGIN_PX * 2}px`);
  });

  it('keeps side flips and clamps inside horizontal insets', () => {
    const s = computeSubmenuStyle(base({
      bounds: { ...FULL, left: 50, width: VW - 50 }, parentRect: { left: 60, right: VW - 10 },
    }));
    expect(px(s.left)).toBeGreaterThanOrEqual(50 + VIEWPORT_MARGIN_PX);
  });

  it('caps a scrollable submenu height at the viewport fraction', () => {
    const s = computeSubmenuStyle(base({ scrollable: true }));
    expect(s['max-height']).toBe(`${VH * SCROLLABLE_SUBMENU_MAX_VH}px`);
  });

  it('caps a non-scrollable submenu at viewport minus both margins', () => {
    const s = computeSubmenuStyle(base({ scrollable: false }));
    expect(s['max-height']).toBe(`${VH - VIEWPORT_MARGIN_PX * 2}px`);
  });

  it('neutralizes the UA [popover] inset/margin defaults', () => {
    const s = computeSubmenuStyle(base());
    expect(s.position).toBe('fixed');
    expect(s.right).toBe('auto');
    expect(s.bottom).toBe('auto');
    expect(s.margin).toBe('0');
    expect(s.width).toBe('max-content');
  });
});
