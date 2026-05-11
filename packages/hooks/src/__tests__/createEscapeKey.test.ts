import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { createEscapeKey } from '../createEscapeKey';

describe('createEscapeKey', () => {
  it('fires on Escape', () => {
    const handler = vi.fn();
    createRoot(() => createEscapeKey(handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const handler = vi.fn();
    createRoot(() => createEscapeKey(handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('respects enabled=false', () => {
    const handler = vi.fn();
    createRoot(() => createEscapeKey(handler, { enabled: () => false }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).not.toHaveBeenCalled();
  });
});
