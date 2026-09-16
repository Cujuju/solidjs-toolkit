import { createSignal, type Accessor } from 'solid-js';
import { safeStorageRead, safeStorageRemove, safeStorageWrite } from './_internal/safeStorage';

/**
 * Reactive JSON-serialized localStorage signal, shaped like `createSignal`; falls back to
 * `defaultValue` on a missing key or parse error. `set(undefined)` removes the key; a BigInt
 * or circular value throws.
 */
export function createLocalStorage<T>(
  key: string,
  defaultValue: T,
): [Accessor<T>, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = createSignal<T>(
    safeStorageRead(key, (raw) => JSON.parse(raw) as T, defaultValue),
  );

  const set = (v: T | ((prev: T) => T)): void => {
    const next = typeof v === 'function' ? (v as (prev: T) => T)(value()) : v;
    // JSON.stringify returns undefined (not a string) for undefined; store absence instead of "undefined".
    const raw = JSON.stringify(next) as string | undefined;
    if (raw === undefined) safeStorageRemove(key);
    else safeStorageWrite(key, raw);
    (setValue as unknown as (v: T) => void)(next);
  };

  return [value, set];
}
