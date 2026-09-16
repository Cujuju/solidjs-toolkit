/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

/**
 * Cascade contracts jsdom cannot compute (it applies no stylesheet), read from
 * the CSS source text — the approach accordion-dock's `cssCascade.test.ts` takes.
 */

const CSS_SOURCES = import.meta.glob('../*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Every comma-separated selector of every `selector { body }` run, comments stripped. */
function selectors(): string[] {
  const css = Object.values(CSS_SOURCES)
    .map((s) => s.replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');
  return Array.from(css.matchAll(/([^{};]+)\{[^{}]*\}/g), (m) => m[1])
    .flatMap((group) => group.split(','))
    .map((s) => s.trim());
}

describe('menu-tint preset chips', () => {
  it('the hover rule excludes the active chip, so hover never repaints it', () => {
    const hover = selectors().filter((s) => s.includes('.cujuju-mt-preset-chip:hover'));
    expect(hover.length).toBeGreaterThan(0);
    expect(hover.filter((s) => !s.includes(':not(.cujuju-mt-preset-chip--active)'))).toEqual([]);
  });
});
