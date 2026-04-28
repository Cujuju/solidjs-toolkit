import { createSignal, onCleanup, type Accessor } from 'solid-js';

export type AsyncStatus = 'idle' | 'loading' | 'done' | 'error';

export interface UseAsyncStatusOptions {
  /** ms before auto-resetting to 'idle' after done/error. Default 2000. */
  resetMs?: number;
  /** Whether to auto-reset on error. Default true. */
  resetOnError?: boolean;
}

export interface UseAsyncStatusReturn<T, A extends unknown[]> {
  status: Accessor<AsyncStatus>;
  error: Accessor<Error | null>;
  result: Accessor<T | null>;
  run: (...args: A) => Promise<T | null>;
  reset: () => void;
}

/**
 * State machine for async actions with a timed auto-reset. Cycles:
 *   idle → loading → done → (after resetMs) idle
 *   idle → loading → error → (after resetMs if resetOnError) idle
 *
 * Useful for buttons that show a brief "done" / "error" state before
 * returning to their default look.
 */
export function useAsyncStatus<T, A extends unknown[] = unknown[]>(
  fn: (...args: A) => Promise<T>,
  options: UseAsyncStatusOptions = {},
): UseAsyncStatusReturn<T, A> {
  const resetMs = options.resetMs ?? 2000;
  const resetOnError = options.resetOnError ?? true;

  const [status, setStatus] = createSignal<AsyncStatus>('idle');
  const [error, setError] = createSignal<Error | null>(null);
  const [result, setResult] = createSignal<T | null>(null);

  let resetTimer: ReturnType<typeof setTimeout> | undefined;

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
    clearResetTimer();
    setStatus('idle');
    setError(null);
    setResult(null);
  };

  const run = async (...args: A): Promise<T | null> => {
    clearResetTimer();
    setStatus('loading');
    setError(null);
    try {
      const value = await fn(...args);
      (setResult as unknown as (v: T | null) => void)(value);
      setStatus('done');
      scheduleReset();
      return value;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
      if (resetOnError) scheduleReset();
      return null;
    }
  };

  onCleanup(clearResetTimer);

  return { status, error, result, run, reset };
}
