import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Trailing debounce of `fn`, cancelled on dispose. `isPending` spans call to fire/cancel/flush,
 * and clears even if `fn` throws.
 */
export function createDebouncedCallback<A extends unknown[]>(
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
