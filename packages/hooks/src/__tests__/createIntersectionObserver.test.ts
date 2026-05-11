import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { createIntersectionObserver } from '../createIntersectionObserver';

describe('createIntersectionObserver', () => {
  it('wires up without throwing when element is present', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    expect(() => {
      createRoot(() => createIntersectionObserver(() => el, handler));
    }).not.toThrow();

    document.body.removeChild(el);
  });

  it('handles undefined element gracefully', () => {
    const handler = vi.fn();
    expect(() => {
      createRoot(() => createIntersectionObserver(() => undefined, handler));
    }).not.toThrow();
  });
});
