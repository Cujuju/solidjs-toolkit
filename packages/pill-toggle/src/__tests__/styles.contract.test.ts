import { describe, it, expect, afterEach } from 'vitest';
import { DOT_INSET_PX } from '../_internal/dotPosition';
import { cleanupToggles, renderToggle } from './_helpers';

/**
 * Stylesheet contract tests. jsdom neither substitutes var() nor tracks
 * :active, so these assert on the stylesheet text and match its real
 * selectors against rendered DOM.
 */

// Vite rewrites the literal `import.meta.glob(` call; this package has no vite/client types.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { query: string; import: string; eager: true }): unknown;
  }
}

// Same raw-source approach as accordion-dock's domContract.test.tsx.
const CSS_SOURCES = import.meta.glob('../styles.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const css = Object.values(CSS_SOURCES).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

// Anchored at the start of a line: '.ctp-dot' is also a substring of the
// descendant selector '.ctp-root[aria-checked="mixed"] .ctp-dot'.
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\n)[ \t]*${escaped} \{`).exec(css);
  if (!match) throw new Error(`rule not found: ${selector}`);
  const start = match.index;
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

afterEach(cleanupToggles);

describe('theme tokens resolve against the toggle, not :root', () => {
  // var() inside a custom property is substituted where it is declared, so a
  // derived token at :root freezes the :root value and ignores prop overrides.
  it('no :root default token references another token', () => {
    const root = ruleBody(':root');
    const derived = root.split(';').filter((decl) => /^\s*--tp-[\w-]+\s*:.*var\(/.test(decl));
    expect(derived).toEqual([]);
  });

  it('indeterminate dot fill derives from --tp-dot at the use site', () => {
    const body = ruleBody('.ctp-root[aria-checked="mixed"] .ctp-dot');
    expect(body).toContain('var(--tp-dot-mixed,');
    expect(body).toContain('var(--tp-dot)');
  });

  it('focus ring derives from --tp-focus-ring-color and --tp-off-bg at the use site', () => {
    const body = ruleBody('.ctp-root:focus-visible');
    expect(body).toContain('var(--tp-focus-ring,');
    expect(body).toContain('var(--tp-focus-ring-color,');
    expect(body).toContain('var(--tp-off-bg)');
  });
});

describe('press effects', () => {
  const pressSelectors = [...css.matchAll(/([^{}]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((sel) => sel.includes('[data-press-effect=') && sel.includes(':active'));

  // The toggle's own compound selector with the untestable :active dropped.
  const rootCompound = (sel: string): string => sel.split(/\s+/)[0].replace(':active', '').replace('::after', '');

  it('covers both press effects', () => {
    expect(pressSelectors.some((s) => s.includes('"scale"'))).toBe(true);
    expect(pressSelectors.some((s) => s.includes('"ripple"'))).toBe(true);
  });

  for (const effect of ['scale', 'ripple'] as const) {
    it(`${effect}: applies to an interactive toggle only (not readOnly / loading)`, () => {
      const sel = rootCompound(pressSelectors.find((s) => s.includes(`"${effect}"`))!);

      const live = renderToggle({ enabled: true, pressEffect: effect, onToggle: () => {} });
      expect(live.toggle().matches(sel)).toBe(true);
      live.dispose();

      for (const inactive of [{ readOnly: true }, { loading: true }, { disabled: true }] as const) {
        const r = renderToggle({ enabled: true, pressEffect: effect, onToggle: () => {}, ...inactive });
        expect(r.toggle().matches(sel)).toBe(false);
        r.dispose();
      }
    });
  }

  it('scale: the dot carries no inline transform, so the stylesheet rule can win the cascade', () => {
    const { dispose, toggle } = renderToggle({ enabled: true, pressEffect: 'scale', onToggle: () => {} });
    const dot = toggle().querySelector('.ctp-dot') as HTMLElement;
    expect(dot.style.transform).toBe('');
    const scaleRule = pressSelectors.find((s) => s.includes('"scale"'))!;
    // Composed, not replaced: dropping the translateX would snap the dot to the
    // off position for the duration of the press.
    expect(ruleBody(scaleRule)).toMatch(/transform:\s*translateX\(var\(--tp-dot-x, 0\)\) scale\(/);
    dispose();
  });
});

describe('dot geometry contract', () => {
  it('the default dot sizes itself from the track, so a percentage height works', () => {
    const body = ruleBody('.ctp-dot');
    expect(body).toMatch(/height:\s*calc\(100% - var\(--tp-dot-inset\) \* 2\)/);
    expect(body).toMatch(/aspect-ratio:\s*1/);
  });

  it('--tp-dot-inset mirrors DOT_INSET_PX', () => {
    expect(ruleBody(':root')).toContain(`--tp-dot-inset: ${DOT_INSET_PX}px`);
  });

  it('the dot slides on transform only — animating left would relayout each frame', () => {
    const body = ruleBody('.ctp-dot');
    expect(body).toMatch(/transform:\s*translateX\(var\(--tp-dot-x, 0\)\)/);
    expect(body).toMatch(/transition:\s*transform var\(--tp-transition/);
    expect(body).not.toMatch(/transition:[^;]*\bleft\b/);
  });
});
