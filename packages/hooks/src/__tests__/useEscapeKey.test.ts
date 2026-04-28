import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useEscapeKey } from '../useEscapeKey';

describe('useEscapeKey', () => {
  it('fires on Escape', () => {
    const handler = vi.fn();
    createRoot(() => useEscapeKey(handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const handler = vi.fn();
    createRoot(() => useEscapeKey(handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('respects enabled=false', () => {
    const handler = vi.fn();
    createRoot(() => useEscapeKey(handler, { enabled: () => false }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).not.toHaveBeenCalled();
  });
});
