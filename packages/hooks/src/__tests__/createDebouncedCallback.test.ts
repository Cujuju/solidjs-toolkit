import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createDebouncedCallback } from '../createDebouncedCallback';

describe('createDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays invocation', () => {
    const fn = vi.fn();
    createRoot(() => {
      const { call } = createDebouncedCallback(fn, 100);
      call('a');
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith('a');
    });
  });

  it('only fires once per burst', () => {
    const fn = vi.fn();
    createRoot(() => {
      const { call } = createDebouncedCallback(fn, 100);
      call('a');
      call('b');
      call('c');
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });
  });

  it('cancel prevents invocation', () => {
    const fn = vi.fn();
    createRoot(() => {
      const { call, cancel } = createDebouncedCallback(fn, 100);
      call('a');
      cancel();
      vi.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  it('flush fires pending call immediately', () => {
    const fn = vi.fn();
    createRoot(() => {
      const { call, flush } = createDebouncedCallback(fn, 100);
      call('a');
      flush();
      expect(fn).toHaveBeenCalledWith('a');
    });
  });

  it('cleans up on dispose', () => {
    const fn = vi.fn();
    const dispose = createRoot((d) => {
      const { call } = createDebouncedCallback(fn, 100);
      call('a');
      return d;
    });
    dispose();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  // ─── isPending accessor ───────────────────────────────────────────────────

  describe('isPending', () => {
    it('is false initially', () => {
      const fn = vi.fn();
      createRoot(() => {
        const { isPending } = createDebouncedCallback(fn, 100);
        expect(isPending()).toBe(false);
      });
    });

    it('flips true on call() before timer fires', () => {
      const fn = vi.fn();
      createRoot(() => {
        const { call, isPending } = createDebouncedCallback(fn, 100);
        call('a');
        expect(isPending()).toBe(true);
        // Mid-window — still pending
        vi.advanceTimersByTime(50);
        expect(isPending()).toBe(true);
      });
    });

    it('flips false after timer fires', () => {
      const fn = vi.fn();
      createRoot(() => {
        const { call, isPending } = createDebouncedCallback(fn, 100);
        call('a');
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledWith('a');
        expect(isPending()).toBe(false);
      });
    });

    it('flips false after cancel()', () => {
      const fn = vi.fn();
      createRoot(() => {
        const { call, cancel, isPending } = createDebouncedCallback(fn, 100);
        call('a');
        expect(isPending()).toBe(true);
        cancel();
        expect(isPending()).toBe(false);
      });
    });

    it('flips false after flush()', () => {
      const fn = vi.fn();
      createRoot(() => {
        const { call, flush, isPending } = createDebouncedCallback(fn, 100);
        call('a');
        expect(isPending()).toBe(true);
        flush();
        expect(fn).toHaveBeenCalledWith('a');
        expect(isPending()).toBe(false);
      });
    });

    it('flips false even if fn throws (try/finally guard)', () => {
      const fn = vi.fn(() => { throw new Error('boom'); });
      createRoot(() => {
        const { call, isPending } = createDebouncedCallback(fn, 100);
        call('a');
        expect(isPending()).toBe(true);
        // Timer fires inside this advance; fn throws; finally runs setPending(false).
        // The throw escapes the timer callback (uncaught in the timer queue) — vitest
        // surfaces it via the timer's runner; we catch any error so the test framework
        // doesn't fail on the rethrow, then assert the finally still ran.
        try { vi.advanceTimersByTime(100); } catch { /* expected: thrown by fn */ }
        expect(fn).toHaveBeenCalled();
        expect(isPending()).toBe(false);
      });
    });
  });
});
