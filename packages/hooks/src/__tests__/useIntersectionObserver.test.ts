import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useIntersectionObserver } from '../useIntersectionObserver';

describe('useIntersectionObserver', () => {
  it('wires up without throwing when element is present', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    expect(() => {
      createRoot(() => useIntersectionObserver(() => el, handler));
    }).not.toThrow();

    document.body.removeChild(el);
  });

  it('handles undefined element gracefully', () => {
    const handler = vi.fn();
    expect(() => {
      createRoot(() => useIntersectionObserver(() => undefined, handler));
    }).not.toThrow();
  });
});
