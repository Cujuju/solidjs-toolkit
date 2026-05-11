import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { createHotkey } from '../createHotkey';

describe('createHotkey', () => {
  it('fires on matching combo (ctrl+k)', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('ctrl+k', handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('CTRL+K', handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('modifier order does not matter', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('shift+ctrl+p', handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire when extra modifier is pressed', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('ctrl+k', handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire when required modifier is missing', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('ctrl+k', handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('modifier-only combo never matches', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('ctrl', handler));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('cmd aliases meta', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('cmd+k', handler));
    // Workaround: happy-dom 14.12.3 drops metaKey from KeyboardEvent constructor options.
    // Build the event then set metaKey via Object.defineProperty.
    const e = new KeyboardEvent('keydown', { key: 'k' });
    Object.defineProperty(e, 'metaKey', { value: true });
    document.dispatchEvent(e);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('respects enabled=false', () => {
    const handler = vi.fn();
    createRoot(() => createHotkey('ctrl+k', handler, { enabled: () => false }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  // ─── Key aliases (additive — direct names still work) ───────────────────

  describe('key aliases', () => {
    it.each([
      ['up', 'ArrowUp'],
      ['down', 'ArrowDown'],
      ['left', 'ArrowLeft'],
      ['right', 'ArrowRight'],
    ])('%s alias matches %s event', (alias, key) => {
      const handler = vi.fn();
      createRoot(() => createHotkey(alias, handler));
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('return alias matches Enter', () => {
      const handler = vi.fn();
      createRoot(() => createHotkey('return', handler));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('esc alias matches Escape', () => {
      const handler = vi.fn();
      createRoot(() => createHotkey('esc', handler));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('space alias matches the space character key', () => {
      const handler = vi.fn();
      createRoot(() => createHotkey('space', handler));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('plus alias matches + key (the only way to bind to + given combo syntax)', () => {
      const handler = vi.fn();
      createRoot(() => createHotkey('shift+plus', handler));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', shiftKey: true }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('direct key names still work alongside aliases (arrowup)', () => {
      const handler = vi.fn();
      createRoot(() => createHotkey('arrowup', handler));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('regular letter keys are not affected by alias resolution', () => {
      const handler = vi.fn();
      createRoot(() => createHotkey('a', handler));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
