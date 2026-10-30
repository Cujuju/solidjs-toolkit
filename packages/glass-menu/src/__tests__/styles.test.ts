/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const CSS = Object.values(
  import.meta.glob('../glass-menu.css', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

let style: HTMLStyleElement;
beforeAll(() => {
  style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
});
afterAll(() => style.remove());

describe('glass-menu.css', () => {
  it('truncates a long title instead of letting it run under the header actions', () => {
    const title = document.createElement('div');
    title.className = 'cujuju-glass-menu-title';
    document.body.appendChild(title);
    const cs = getComputedStyle(title);
    expect(cs.overflow).toBe('hidden');
    expect(cs.textOverflow).toBe('ellipsis');
    expect(cs.whiteSpace).toBe('nowrap');
    title.remove();
  });
});
