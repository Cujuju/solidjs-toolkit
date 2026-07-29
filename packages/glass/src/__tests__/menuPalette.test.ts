// @vitest-environment happy-dom
/**
 * menuPalette contract tests.
 *
 * The interesting one is the LAST describe block: it reads `glass.css`
 * off disk and pins every default against it. The JS defaults and the
 * stylesheet are two statements of one fact — the CSS has to stand alone
 * with no JS on the page, so the duplication is deliberate — and this is
 * what stops them drifting silently.
 *
 * It also asserts the NAMESPACE, which is the whole point of the rename:
 * the six colours must not be declared under `--color-*`, because a name
 * in the host's namespace is a name a host can collide with, whichever
 * way the cascade happens to fall.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GLASS_MENU_TEXT_CSS_VAR,
  GLASS_MENU_BORDER_CSS_VAR,
  GLASS_MENU_INPUT_BG_CSS_VAR,
  GLASS_MENU_PALETTE_DEFAULTS,
  applyGlassMenuPalette,
  resetGlassMenuPalette,
} from '../menuPalette';

const root = () => document.documentElement;

beforeEach(() => {
  resetGlassMenuPalette();
});

describe('applyGlassMenuPalette', () => {
  it('writes a field as an inline custom property', () => {
    applyGlassMenuPalette({ border: 'rgb(1, 2, 3)' });
    expect(root().style.getPropertyValue(GLASS_MENU_BORDER_CSS_VAR)).toBe('rgb(1, 2, 3)');
  });

  it('is PARTIAL — untouched fields are left alone', () => {
    applyGlassMenuPalette({ border: 'rgb(1, 2, 3)' });
    applyGlassMenuPalette({ text: 'rgb(4, 5, 6)' });
    expect(root().style.getPropertyValue(GLASS_MENU_BORDER_CSS_VAR)).toBe('rgb(1, 2, 3)');
    expect(root().style.getPropertyValue(GLASS_MENU_TEXT_CSS_VAR)).toBe('rgb(4, 5, 6)');
  });

  it('treats an empty string as "leave alone", not as a clear', () => {
    // setProperty('') silently does nothing, so writing it would read as
    // a clear that never happened. Skipping it keeps the prior value.
    applyGlassMenuPalette({ border: 'rgb(1, 2, 3)' });
    applyGlassMenuPalette({ border: '' });
    expect(root().style.getPropertyValue(GLASS_MENU_BORDER_CSS_VAR)).toBe('rgb(1, 2, 3)');
  });

  it('null REMOVES the properties rather than writing the defaults back', () => {
    // Writing defaults back would pin the value and defeat a host's own
    // CSS-level override; removing hands control back to the stylesheet.
    applyGlassMenuPalette({ border: 'rgb(1, 2, 3)', inputBg: 'rgb(7, 8, 9)' });
    applyGlassMenuPalette(null);
    expect(root().style.getPropertyValue(GLASS_MENU_BORDER_CSS_VAR)).toBe('');
    expect(root().style.getPropertyValue(GLASS_MENU_INPUT_BG_CSS_VAR)).toBe('');
  });

  it('resetGlassMenuPalette is the same clear', () => {
    applyGlassMenuPalette({ text: 'rgb(1, 2, 3)' });
    resetGlassMenuPalette();
    expect(root().style.getPropertyValue(GLASS_MENU_TEXT_CSS_VAR)).toBe('');
  });
});

// ── The contract that matters ────────────────────────────────────────────────

describe('the stylesheet and the JS defaults are one fact', () => {
  // Resolved from the package root (vitest's cwd) rather than
  // `import.meta.url`: under the happy-dom environment that URL is not a
  // file: URL, and fileURLToPath rejects it.
  const css = readFileSync(resolve(process.cwd(), 'src/glass.css'), 'utf8');

  it('declares every default at the value this module reports', () => {
    for (const [field, value] of Object.entries(GLASS_MENU_PALETTE_DEFAULTS)) {
      const cssVar = `--cujuju-glass-menu-${field
        .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(css, `${cssVar} missing from glass.css`).toContain(`${cssVar}:`);
      const declared = css.match(
        new RegExp(`${cssVar}:\\s*([^;]+);`),
      )?.[1]?.trim();
      expect(declared, `${cssVar} drifted from GLASS_MENU_PALETTE_DEFAULTS`).toBe(value);
    }
  });

  it('declares NO menu colour in the host --color-* namespace', () => {
    // The rename's whole purpose. A library token under `--color-` is a
    // name the host can collide with — which is exactly how this package
    // once repainted a consuming app's dividers.
    const rootBlock = css.match(/@layer cujuju-defaults\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(rootBlock).not.toMatch(/^\s*--color-[\w-]+\s*:/m);
  });

  it('reads the two HOST tokens only through a fallback, never declaring them', () => {
    // `var(--color-x, fallback)` is layer-proof; a declaration is not.
    expect(css).toMatch(/--cujuju-glass-surface:\s*var\(--color-surface,/);
    expect(css).toMatch(/--cujuju-glass-border:\s*var\(--color-border,/);
    // No `:root`-level declaration of either host token anywhere.
    const rootBlock = css.match(/@layer cujuju-defaults\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(rootBlock).not.toMatch(/--color-surface\s*:/);
    expect(rootBlock).not.toMatch(/--color-border\s*:/);
  });
});
