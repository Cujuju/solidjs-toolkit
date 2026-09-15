/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

/**
 * jsdom resolves neither `transform` nor `box-shadow` from a sheet, so these direction
 * contracts read styles.css source (as accordion-dock's cssCascade test does).
 */

const CHIP_CSS = Object.values(
  import.meta.glob('../styles.css', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` runs, comments stripped, whitespace collapsed. */
function rules(): Rule[] {
  const css = CHIP_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  return Array.from(css.matchAll(/([^{};]+)\{([^{}]*)\}/g), (m) => ({
    selector: m[1].trim().replace(/\s+/g, ' '),
    body: m[2].replace(/\s+/g, ' '),
  }));
}

describe('styles.css direction contracts', () => {
  it('loads real stylesheet text (guards against an empty stub)', () => {
    expect(CHIP_CSS.length).toBeGreaterThan(0);
  });

  it('no rule keys off a literal [dir="rtl"] attribute', () => {
    // An attribute selector misses dir="auto" and a dir set on the chip itself;
    // :dir(rtl) reads the resolved directionality.
    const attr = rules().filter((r) => /\[dir=["']?rtl["']?\]/.test(r.selector));
    expect(attr.map((r) => r.selector)).toEqual([]);
  });

  it('glyph neutral-centring flips its shift under :dir(rtl)', () => {
    const rtl = rules().filter(
      (r) =>
        r.selector.includes('[data-glyph-empty]') &&
        r.selector.includes(':dir(rtl)') &&
        r.selector.endsWith('.ctc-chip-label'),
    );
    expect(rtl).toHaveLength(1);
    expect(rtl[0].body).toMatch(/translateX\(calc\(var\(--ctc-glyph-col\) \/ 2\)\)/);
  });

  for (const state of ['included', 'excluded'] as const) {
    it(`rail (${state}) paints the inline-start edge in both directions`, () => {
      const rail = rules().filter(
        (r) =>
          r.selector.includes('[data-indicator="rail"]') &&
          r.selector.includes(`[data-state="${state}"]`),
      );
      const ltr = rail.filter((r) => !r.selector.includes(':dir(rtl)'));
      const rtl = rail.filter((r) => r.selector.includes(':dir(rtl)'));
      expect(ltr).toHaveLength(1);
      expect(ltr[0].body).toMatch(/box-shadow: inset var\(--ctc-rail-width\) 0 0/);
      expect(rtl).toHaveLength(1);
      expect(rtl[0].body).toMatch(/box-shadow: inset calc\(-1 \* var\(--ctc-rail-width\)\) 0 0/);
    });
  }
});
