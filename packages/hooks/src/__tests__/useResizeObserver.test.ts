import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useResizeObserver } from '../useResizeObserver';

describe('useResizeObserver', () => {
  it('wires up without throwing when element is present', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    // happy-dom has stub ResizeObserver; this is mostly a smoke test.
    expect(() => {
      createRoot(() => useResizeObserver(() => el, handler));
    }).not.toThrow();

    document.body.removeChild(el);
  });

  it('handles undefined element gracefully', () => {
    const handler = vi.fn();
    expect(() => {
      createRoot(() => useResizeObserver(() => undefined, handler));
    }).not.toThrow();
  });
});
