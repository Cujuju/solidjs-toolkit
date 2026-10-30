/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Source-text assertions: jsdom's CSSOM rejects the whole sheet on its `@layer` block.
const CSS = Object.values(
  import.meta.glob('../glass-menu.css', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

function blockFor(selector: string): string {
  const start = CSS.indexOf(`\n${selector} {`);
  expect(start, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf('}', start));
}

describe('glass-menu.css', () => {
  it('truncates a long title instead of letting it run under the header actions', () => {
    const title = blockFor('.cujuju-glass-menu-title');
    expect(title).toMatch(/\soverflow:\s*hidden;/);
    expect(title).toMatch(/\stext-overflow:\s*ellipsis;/);
    expect(title).toMatch(/\swhite-space:\s*nowrap;/);
  });
});
