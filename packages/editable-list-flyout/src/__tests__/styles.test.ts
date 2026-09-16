/// <reference types="vite/client" />
/**
 * Palette contract: every foreground token on the dark flyout panel stays
 * legible on `--cuj-elf-popover-bg`. Loads styles.css as a Vite `?raw` string.
 */

import { describe, it, expect } from 'vitest';

const CSS_SOURCES = import.meta.glob('../styles.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const css = CSS_SOURCES['../styles.css'];

// WCAG 2.x: 1.4.3 text contrast, 1.4.11 non-text (icon glyph) contrast.
const MIN_TEXT_CONTRAST = 4.5;
const MIN_ICON_CONTRAST = 3;

// editable-list-row declares its tokens on every `[data-cuj-elr]` element, so
// an override must match those elements directly; inheriting from an ancestor loses.
const ROW_TOKEN_SCOPE = "[data-cuj-elf='list'] [data-cuj-elr]";

function blockFor(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

function tokenIn(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  expect(match, `${name} not declared as a #rrggbb literal`).not.toBeNull();
  return match![1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('flyout palette on the dark popover', () => {
  const root = blockFor('[data-cuj-elf]');
  const bg = tokenIn(root, '--cuj-elf-popover-bg');

  it.each(['--cuj-elf-footer-fg', '--cuj-elf-footer-fg-hover'])('%s is legible text', (name) => {
    expect(contrast(tokenIn(root, name), bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('popover sets its own legible text colour instead of inheriting the host page', () => {
    expect(blockFor("[data-cuj-elf='popover']")).toMatch(/\scolor:\s*var\(--cuj-elf-popover-fg\);/);
    expect(contrast(tokenIn(root, '--cuj-elf-popover-fg'), bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each(['--cuj-elr-icon-fg', '--cuj-elr-icon-fg-hover'])('row %s is overridden and legible', (name) => {
    expect(contrast(tokenIn(blockFor(ROW_TOKEN_SCOPE), name), bg)).toBeGreaterThanOrEqual(MIN_ICON_CONTRAST);
  });
});
