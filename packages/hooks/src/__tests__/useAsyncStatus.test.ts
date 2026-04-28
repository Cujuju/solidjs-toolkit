import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useAsyncStatus } from '../useAsyncStatus';

describe('useAsyncStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('transitions idle → loading → done → idle', async () => {
    await createRoot(async () => {
      const { status, run } = useAsyncStatus(async () => 'ok', { resetMs: 1000 });
      expect(status()).toBe('idle');
      const p = run();
      expect(status()).toBe('loading');
      await p;
      expect(status()).toBe('done');
      vi.advanceTimersByTime(1000);
      expect(status()).toBe('idle');
    });
  });

  it('transitions idle → loading → error → idle', async () => {
    await createRoot(async () => {
      const { status, error, run } = useAsyncStatus(async () => {
        throw new Error('boom');
      }, { resetMs: 500 });
      await run();
      expect(status()).toBe('error');
      expect(error()?.message).toBe('boom');
      vi.advanceTimersByTime(500);
      expect(status()).toBe('idle');
    });
  });

  it('stays in error when resetOnError=false', async () => {
    await createRoot(async () => {
      const { status, run } = useAsyncStatus(async () => {
        throw new Error('boom');
      }, { resetMs: 500, resetOnError: false });
      await run();
      expect(status()).toBe('error');
      vi.advanceTimersByTime(1000);
      expect(status()).toBe('error');
    });
  });

  it('reset clears state', async () => {
    await createRoot(async () => {
      const { status, result, run, reset } = useAsyncStatus(async () => 42);
      await run();
      expect(result()).toBe(42);
      reset();
      expect(status()).toBe('idle');
      expect(result()).toBe(null);
    });
  });

  it('run returns the resolved value', async () => {
    await createRoot(async () => {
      const { run } = useAsyncStatus(async (n: number) => n * 2);
      const v = await run(5);
      expect(v).toBe(10);
    });
  });

  it('run returns null on error', async () => {
    await createRoot(async () => {
      const { run } = useAsyncStatus(async () => {
        throw new Error('x');
      });
      const v = await run();
      expect(v).toBe(null);
    });
  });
});
