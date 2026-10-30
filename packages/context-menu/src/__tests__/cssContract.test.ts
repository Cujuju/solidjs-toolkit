/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Read as TEXT through Vite (needs `css: true` in vitest.config — the default stub is empty).
const MENU_CSS = Object.values(
  import.meta.glob('../context-menu.css', { query: '?raw', import: 'default', eager: true }),
)[0] as string;
const GLASS_CSS = Object.values(
  import.meta.glob('../../../glass/src/glass.css', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

let style: HTMLStyleElement;

beforeAll(() => {
  style = document.createElement('style');
  style.textContent = MENU_CSS;
  document.head.appendChild(style);
});

afterAll(() => {
  style.remove();
  document.body.innerHTML = '';
});

function mount(className: string, childClass?: string): { el: HTMLElement; child?: HTMLElement } {
  const el = document.createElement('div');
  el.className = className;
  let child: HTMLElement | undefined;
  if (childClass) {
    child = document.createElement('div');
    child.className = childClass;
    el.appendChild(child);
  }
  document.body.appendChild(el);
  return { el, child };
}

describe('context-menu.css', () => {
  it('loads real stylesheet text (guards against an empty stub)', () => {
    expect(MENU_CSS.length).toBeGreaterThan(0);
    expect(GLASS_CSS.length).toBeGreaterThan(0);
  });

  it('solid surface scrolls rather than clips when its inline max-height caps it', () => {
    const { el } = mount('cujuju-context-menu cujuju-context-menu-flyout cujuju-context-menu--solid');
    expect(getComputedStyle(el).overflowY).toBe('auto');
  });

  it('solid-surface labels inherit the danger colour from their item', () => {
    const { el } = mount('cujuju-context-menu--solid');
    const item = document.createElement('button');
    item.className = 'cujuju-context-menu-item cujuju-context-menu-item-danger';
    const label = document.createElement('span');
    label.className = 'cujuju-context-menu-label';
    item.appendChild(label);
    el.appendChild(item);
    expect(getComputedStyle(label).color).toBe(getComputedStyle(item).color);
  });

  it('root and flyouts are border-box, so the inline viewport max-height includes padding + border', () => {
    const { el } = mount('cujuju-context-menu');
    expect(getComputedStyle(el).boxSizing).toBe('border-box');
  });

  it('styles the header band on the default (glass) surface, not only under --solid', () => {
    const { child } = mount('cujuju-context-menu', 'cujuju-context-menu-header');
    const cs = getComputedStyle(child as HTMLElement);
    expect(cs.textTransform).toBe('uppercase');
    expect(cs.paddingTop).not.toBe('');
  });

  it('never paints a hover fill on a disabled item or row button', () => {
    const hoverSelectors = Array.from((style.sheet as CSSStyleSheet).cssRules)
      .filter((r): r is CSSStyleRule => r instanceof CSSStyleRule)
      .flatMap((r) => r.selectorText.split(','))
      .map((s) => s.trim())
      .filter((s) => /cujuju-context-menu-(item|row-btn)[\w-]*:hover/.test(s));

    expect(hoverSelectors.length).toBeGreaterThan(0);
    for (const s of hoverSelectors) expect(s).toContain(':not(:disabled)');
  });

  it('sticky search backing reads no token that .glass-menu rebinds', () => {
    // Every `.glass-menu` rule, layered (indented) or not.
    const glassMenuBlocks = Array.from(GLASS_CSS.matchAll(/(?:^|\n)\s*\.glass-menu\s*\{([^}]*)\}/g), (m) => m[1]).join('');
    const rebound = new Set(Array.from(glassMenuBlocks.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]));
    const background =
      /\.cujuju-context-menu-flyout-search\s*\{[^}]*?background:\s*([^;]+);/.exec(MENU_CSS)?.[1] ?? '';
    const token = /var\(\s*(--[\w-]+)/.exec(background)?.[1];

    expect(rebound.size).toBeGreaterThan(0);
    expect(token).toBeDefined();
    expect(rebound.has(token as string)).toBe(false);
    // A misspelled/undeclared token would fall back to the rebound --color-surface.
    expect(GLASS_CSS).toMatch(new RegExp(`${token}\\s*:`));
    // Public menu-palette namespace only; `--cujuju-glass-*` mirrors are glass-private.
    expect(token).toMatch(/^--cujuju-glass-menu-/);
  });

  it('solid search backing matches the solid card background', () => {
    const declared = (selector: string) =>
      new RegExp(`(?:^|\\n)${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*?\\bbackground:\\s*([^;]+);`)
        .exec(MENU_CSS)?.[1]
        ?.trim();
    const card = declared('.cujuju-context-menu--solid');

    expect(card).toBeDefined();
    expect(declared('.cujuju-context-menu--solid .cujuju-context-menu-flyout-search')).toBe(card);
  });
});
