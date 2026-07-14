/**
 * Placement geometry — pure, so it is provable without a DOM.
 *
 * These are the cases the browser will not tell you about until a user is standing at the
 * bottom of the screen with a 10-row ladder and nowhere to put it.
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePopoutPosition,
  POPOUT_VIEWPORT_MARGIN_PX,
  POPOUT_DEFAULT_GAP_PX,
} from '../_internal/popout';

const VIEWPORT = { width: 1000, height: 800 };
const PANEL = { width: 140, height: 200 };
const GAP = POPOUT_DEFAULT_GAP_PX;

describe('resolvePopoutPosition', () => {
  it('opens BELOW by default when there is room — a list reads downward', () => {
    // The deliberate divergence from the sibling number-picker's pop-out, which prefers TOP.
    const anchor = { top: 300, left: 100, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT);
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(300 + 22 + GAP);
    expect(p.left).toBe(100);
  });

  it('flips ABOVE when there is not enough room below', () => {
    const anchor = { top: 700, left: 100, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT);
    expect(p.placement).toBe('top');
    expect(p.top).toBe(700 - PANEL.height - GAP);
  });

  it('honours an explicit preference for the top', () => {
    const anchor = { top: 300, left: 100, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT, GAP, 'top');
    expect(p.placement).toBe('top');
    expect(p.top).toBe(300 - PANEL.height - GAP);
  });

  it('flips a top-preferring panel back DOWN when the anchor is near the ceiling', () => {
    const anchor = { top: 10, left: 100, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT, GAP, 'top');
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(10 + 22 + GAP);
  });

  it('takes the roomier side and CLAMPS when the panel fits on neither', () => {
    // A viewport shorter than the panel. Losing the bottom edge still shows the nearest-dated
    // rows; losing the TOP edge shows nothing usable at all, so the top must stay on-screen.
    const shortViewport = { width: 1000, height: 150 };
    const anchor = { top: 120, left: 100, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, shortViewport);
    expect(p.placement).toBe('top');
    expect(p.top).toBe(POPOUT_VIEWPORT_MARGIN_PX);
  });

  it('clamps a right-edge anchor so the panel never leaves the screen', () => {
    // The panel is wider than its anchor (every row carries a DTE the pill was hiding), so a
    // pill flush to the right edge would otherwise push it off.
    const anchor = { top: 300, left: 980, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT);
    expect(p.left).toBe(VIEWPORT.width - PANEL.width - POPOUT_VIEWPORT_MARGIN_PX);
  });

  it('clamps a left-edge anchor to the viewport margin', () => {
    const anchor = { top: 300, left: -20, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT);
    expect(p.left).toBe(POPOUT_VIEWPORT_MARGIN_PX);
  });

  it('respects a custom gap', () => {
    const anchor = { top: 300, left: 100, width: 60, height: 22 };
    const p = resolvePopoutPosition(anchor, PANEL, VIEWPORT, 12);
    expect(p.top).toBe(300 + 22 + 12);
  });
});
