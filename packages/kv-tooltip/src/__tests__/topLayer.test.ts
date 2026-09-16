import { describe, it, expect } from 'vitest';
import { isTopLayerSurfaceOpen } from '../_internal/topLayer';

/**
 * jsdom rejects `:popover-open` with SyntaxError — the unsupported-engine path. Asserts the safe
 * fallback ("nothing open"); positive detection is verified in a real browser.
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
