import { createSignal, onCleanup, type Accessor } from 'solid-js';

export type AsyncStatus = 'idle' | 'loading' | 'done' | 'error';

export interface CreateAsyncStatusOptions {
  /** ms before auto-resetting to 'idle' after done/error. Default 2000. */
  resetMs?: number;
  /** Whether to auto-reset on error. Default true. */
  resetOnError?: boolean;
}

export interface CreateAsyncStatusReturn<T, A extends unknown[]> {
  status: Accessor<AsyncStatus>;
  error: Accessor<Error | null>;
  result: Accessor<T | null>;
  run: (...args: A) => Promise<T | null>;
  reset: () => void;
}

/** Async action state: idle → loading → done/error → idle after `resetMs` (error only if `resetOnError`). */
export function createAsyncStatus<T, A extends unknown[] = unknown[]>(
  fn: (...args: A) => Promise<T>,
  options: CreateAsyncStatusOptions = {},
): CreateAsyncStatusReturn<T, A> {
  const resetMs = options.resetMs ?? 2000;
  const resetOnError = options.resetOnError ?? true;

  const [status, setStatus] = createSignal<AsyncStatus>('idle');
  const [error, setError] = createSignal<Error | null>(null);
  const [result, setResult] = createSignal<T | null>(null);

  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every run, reset and disposal; a completion from an older generation is stale. */
  let generation = 0;

  const clearResetTimer = (): void => {
    if (resetTimer !== undefined) {
      clearTimeout(resetTimer);
      resetTimer = undefined;
    }
  };

  const scheduleReset = (): void => {
    clearResetTimer();
    resetTimer = setTimeout(() => {
      resetTimer = undefined;
      setStatus('idle');
      setError(null);
      // don't clear result — callers often want it even after reset
    }, resetMs);
  };

  const reset = (): void => {
    generation += 1;
    clearResetTimer();
    setStatus('idle');
    setError(null);
    setResult(null);
  };

  /** The caller still receives a stale run's outcome; only the shared state ignores it. */
  const run = async (...args: A): Promise<T | null> => {
    const own = ++generation;
    clearResetTimer();
    setStatus('loading');
    setError(null);
    try {
      const value = await fn(...args);
      if (own === generation) {
        // Updater form: a function-valued `T` would otherwise be invoked as a setter callback.
        setResult(() => value);
        setStatus('done');
        scheduleReset();
      }
      return value;
    } catch (e) {
      if (own === generation) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus('error');
        if (resetOnError) scheduleReset();
      }
      return null;
    }
  };

  onCleanup(() => {
    generation += 1;
    clearResetTimer();
  });

  return { status, error, result, run, reset };
}
