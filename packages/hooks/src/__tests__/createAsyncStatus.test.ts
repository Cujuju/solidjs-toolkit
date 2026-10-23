import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createAsyncStatus } from '../createAsyncStatus';

describe('createAsyncStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('transitions idle → loading → done → idle', async () => {
    await createRoot(async () => {
      const { status, run } = createAsyncStatus(async () => 'ok', { resetMs: 1000 });
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
      const { status, error, run } = createAsyncStatus(async () => {
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
      const { status, run } = createAsyncStatus(async () => {
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
      const { status, result, run, reset } = createAsyncStatus(async () => 42);
      await run();
      expect(result()).toBe(42);
      reset();
      expect(status()).toBe('idle');
      expect(result()).toBe(null);
    });
  });

  it('run returns the resolved value', async () => {
    await createRoot(async () => {
      const { run } = createAsyncStatus(async (n: number) => n * 2);
      const v = await run(5);
      expect(v).toBe(10);
    });
  });

  it('run returns null on error', async () => {
    await createRoot(async () => {
      const { run } = createAsyncStatus(async () => {
        throw new Error('x');
      });
      const v = await run();
      expect(v).toBe(null);
    });
  });
});

describe('createAsyncStatus — stale completions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** An action whose calls resolve only when the test says so, in any order. */
  function deferred<T>(): { fn: () => Promise<T>; resolve: (i: number, v: T) => void } {
    const resolvers: Array<(v: T) => void> = [];
    return {
      fn: () => new Promise<T>((r) => resolvers.push(r)),
      resolve: (i, v) => resolvers[i]!(v),
    };
  }

  it('a slower earlier run does not overwrite a later result', async () => {
    await createRoot(async (dispose) => {
      const d = deferred<string>();
      const { result, status, run } = createAsyncStatus(d.fn);
      const first = run();
      const second = run();
      d.resolve(1, 'second');
      await second;
      d.resolve(0, 'first');
      expect(await first).toBe('first'); // the caller still gets its own outcome
      expect(result()).toBe('second');
      expect(status()).toBe('done');
      dispose();
    });
  });

  it('a completion after reset() leaves the state idle', async () => {
    await createRoot(async (dispose) => {
      const d = deferred<string>();
      const { result, status, run, reset } = createAsyncStatus(d.fn);
      const p = run();
      reset();
      d.resolve(0, 'late');
      await p;
      expect(status()).toBe('idle');
      expect(result()).toBeNull();
      dispose();
    });
  });

  it('a completion after disposal schedules no reset timer', async () => {
    const d = deferred<string>();
    let dispose!: () => void;
    const api = createRoot((dispose_) => {
      dispose = dispose_;
      return createAsyncStatus(d.fn);
    });
    const p = api.run();
    dispose();
    d.resolve(0, 'late');
    await p;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stores a function-valued result instead of invoking it as an updater', async () => {
    await createRoot(async (dispose) => {
      const callback = (): number => 42;
      const { result, run } = createAsyncStatus(async () => callback);
      await run();
      expect(result()).toBe(callback);
      dispose();
    });
  });
});