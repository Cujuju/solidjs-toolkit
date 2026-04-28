import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Wraps `fn` so each call resets a pending invocation; `fn` fires once after
 * `ms` ms of no further calls. Pending calls are cancelled on dispose.
 *
 * Returns an object with the debounced function, manual controls, and a
 * reactive `isPending` accessor for "saving…" indicators and similar UX.
 *
 * `isPending` is true between a `call()` and the firing of `fn` (or the
 * intervening `cancel()` / `flush()`). It flips back to false even if `fn`
 * throws — the pending state describes scheduling, not the in-flight call.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): {
  call: (...args: A) => void;
  cancel: () => void;
  flush: () => void;
  isPending: Accessor<boolean>;
} {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: A | undefined;
  const [pending, setPending] = createSignal(false);

  const cancel = (): void => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
    pendingArgs = undefined;
    setPending(false);
  };

  const flush = (): void => {
    if (timerId !== undefined && pendingArgs !== undefined) {
      clearTimeout(timerId);
      const args = pendingArgs;
      timerId = undefined;
      pendingArgs = undefined;
      // try/finally so isPending flips false even if fn throws.
      try { fn(...args); } finally { setPending(false); }
    }
  };

  const call = (...args: A): void => {
    pendingArgs = args;
    if (timerId !== undefined) clearTimeout(timerId);
    setPending(true);
    timerId = setTimeout(() => {
      timerId = undefined;
      const a = pendingArgs as A;
      pendingArgs = undefined;
      // try/finally: a thrown fn must not strand isPending at true forever.
      try { fn(...a); } finally { setPending(false); }
    }, ms);
  };

  onCleanup(cancel);

  return { call, cancel, flush, isPending: pending };
}
