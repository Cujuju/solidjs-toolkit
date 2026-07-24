import { describe, it, expect } from 'vitest';
import { isTopLayerSurfaceOpen } from '../_internal/topLayer';

/**
 * jsdom (v24) does not implement the Popover API and rejects the
 * `:popover-open` pseudo-class with a SyntaxError. That is precisely the
 * unsupported-engine path this helper has to survive: a thrown selector must
 * degrade to "nothing is open", never propagate out of a hover handler and
 * break the whole tooltip.
 *
 * These tests therefore assert the SAFE-FALLBACK contract, not the positive
 * detection — a positive case is not expressible in this environment. The
 * positive path is verified in the playground against a real browser.
 */
describe('isTopLayerSurfaceOpen', () => {
  it('never throws, even where :popover-open is not a supported selector', () => {
    expect(() => isTopLayerSurfaceOpen()).not.toThrow();
  });

  it('reports "nothing open" for a plain document', () => {
    expect(isTopLayerSurfaceOpen()).toBe(false);
  });

  it('reports "nothing open" for a popover element that is not showing', () => {
    const el = document.createElement('div');
    el.setAttribute('popover', 'manual');
    document.body.appendChild(el);
    try {
      expect(isTopLayerSurfaceOpen()).toBe(false);
    } finally {
      el.remove();
    }
  });
});
