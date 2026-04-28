import { createSignal, type Accessor } from 'solid-js';
import { safeStorageRead, safeStorageWrite } from './_internal/safeStorage';

/**
 * Reactive JSON-serialized localStorage signal. Reads on init, writes on every update.
 * Falls back to `defaultValue` on parse error or missing key.
 *
 * @returns `[value, setValue]` — same shape as `createSignal`.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [Accessor<T>, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = createSignal<T>(
    safeStorageRead(key, (raw) => JSON.parse(raw) as T, defaultValue),
  );

  const set = (v: T | ((prev: T) => T)): void => {
    const next = typeof v === 'function' ? (v as (prev: T) => T)(value()) : v;
    safeStorageWrite(key, JSON.stringify(next));
    (setValue as unknown as (v: T) => void)(next);
  };

  return [value, set];
}
