/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

/**
 * jsdom applies no stylesheet, so cascade contracts are asserted on source: each
 * override must exist AND outrank the rule it overrides.
 */

const CSS_SOURCES = import.meta.glob('../*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface Selector {
  file: string;
  /** Source offset of the rule, for same-file ordering. */
  index: number;
  /** An unlayered declaration beats a layered one outright, ahead of specificity. */
  layered: boolean;
  text: string;
  body: string;
}

/** Split a selector list on TOP-LEVEL commas, so `:is(a, b)` stays one selector. */
function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf.trim());
  return parts.filter((p) => p.length > 0);
}

/** Innermost style rules, comments stripped, each tagged with its at-rule nesting. */
function selectors(): Selector[] {
  const out: Selector[] = [];
  for (const [file, source] of Object.entries(CSS_SOURCES)) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const open: string[] = [];
    let start = 0;
    for (let i = 0; i < css.length; i += 1) {
      const ch = css[i];
      if (ch === '{') {
        open.push(css.slice(start, i).trim());
        start = i + 1;
      } else if (ch === '}') {
        const header = open.pop() ?? '';
        const body = css.slice(start, i);
        if (!header.startsWith('@') && !body.includes('{')) {
          const layered = open.some((h) => h.startsWith('@layer'));
          for (const text of splitSelectors(header)) out.push({ file, index: i, layered, text, body });
        }
        start = i + 1;
      }
    }
  }
  return out;
}

/** Class + attribute + pseudo-class count. The package uses no ids, and type
 *  selectors decide none of these contests. */
function specificity(selector: string): number {
  const pseudoElementColons = (selector.match(/::/g) ?? []).length * 2;
  return (selector.match(/[.[:]/g) ?? []).length - pseudoElementColons;
}

function expectOutranks(winners: Selector[], losers: Selector[]): void {
  expect(winners).not.toHaveLength(0);
  expect(losers).not.toHaveLength(0);
  for (const w of winners) {
    for (const l of losers) {
      if (!l.layered) expect(w.layered, `${w.text} is layered, ${l.text} is not`).toBe(false);
      expect(specificity(w.text), `${w.text} vs ${l.text}`).toBeGreaterThan(specificity(l.text));
    }
  }
}

const all = selectors();

describe('the flying-out rail marker', () => {
  const openMarkers = all.filter(
    (s) =>
      s.text.includes(".acc-rail-btn[data-open='true']") &&
      !s.text.includes('data-flyout') &&
      /\bbox-shadow\s*:/.test(s.body),
  );
  const flyoutMarkers = all.filter(
    (s) =>
      s.text.includes("[data-flyout='true']") &&
      s.text.includes("[data-open='true']") &&
      /\bbox-shadow\s*:\s*none/.test(s.body),
  );

  it('removes the open box-shadow stripe at a higher specificity', () => {
    expectOutranks(flyoutMarkers, openMarkers);
  });

  it('paints its dashed stripe at the open marker width', () => {
    for (const s of openMarkers) expect(s.body).toContain('--acc-rail-marker-width');
    for (const s of flyoutMarkers) {
      expect(s.body).toMatch(/background-image\s*:/);
      expect(s.body).toMatch(/background-size\s*:\s*var\(--acc-rail-marker-width\)/);
    }
  });

  it('moves the stripe to the right edge for a right-side rail', () => {
    const right = all.filter(
      (s) =>
        s.text.includes("[data-rail-side='right']") &&
        s.text.includes("[data-flyout='true']") &&
        /background-position\s*:\s*right/.test(s.body),
    );
    expect(right).not.toHaveLength(0);
    // The left-side rail relies on the initial value, so a stray override must not creep in.
    for (const base of flyoutMarkers.filter((s) => !s.text.includes("[data-rail-side='right']"))) {
      const position = /background-position\s*:\s*([^;]+)/.exec(base.body);
      if (position !== null) expect(position[1].trim()).toMatch(/^(left|0)/);
    }
    for (const r of right) {
      for (const f of flyoutMarkers) {
        expect(specificity(r.text)).toBeGreaterThanOrEqual(specificity(f.text));
        if (r.file === f.file) expect(r.index).toBeGreaterThan(f.index);
      }
    }
  });
});

describe('appearance="cards"', () => {
  it('keeps the recessed leaf surface above the card background', () => {
    const cardBackground = all.filter(
      (s) => s.text === ".acc-group[data-appearance='cards'] > .acc-panel" && /\bbackground\s*:/.test(s.body),
    );
    const leafTone = all.filter(
      (s) =>
        s.text.includes("[data-appearance='cards']") &&
        s.text.includes('.acc-leaf') &&
        /\bbackground\s*:/.test(s.body),
    );
    expectOutranks(leafTone, cardBackground);
  });
});

describe('the splitter overhang is one token', () => {
  const OVERHANG = '--_acc-splitter-overhang';

  it('drives every splitter offset and every column clip margin', () => {
    const OFFSET = /\b(top|right|bottom|left|inset(?:-[a-z]+)*)\s*:\s*([^;]+)/g;
    const offsets = all
      .filter((s) => /\.acc-splitter$/.test(s.text))
      .flatMap((s) => Array.from(s.body.matchAll(OFFSET), (m) => m[2].trim()))
      // A handle flush with the edge is the one offset that names no overhang.
      .filter((v) => v !== '0');
    const clips = all.flatMap((s) =>
      Array.from(s.body.matchAll(/overflow-clip-margin\s*:\s*([^;]+)/g), (m) => m[1]),
    );
    expect(offsets).not.toHaveLength(0);
    expect(clips).not.toHaveLength(0);
    for (const v of [...offsets, ...clips]) expect(v).toContain(OVERHANG);
  });

  it('widens by half the card gap under cards, over the flush default', () => {
    const defines = (s: Selector): boolean => new RegExp(`${OVERHANG}\\s*:`).test(s.body);
    const flush = all.filter((s) => s.text === '.acc-group' && defines(s));
    const cards = all.filter(
      (s) => s.text === ".acc-group[data-appearance='cards']" && defines(s) && s.body.includes('--acc-card-gap'),
    );
    expectOutranks(cards, flush);
  });
});
