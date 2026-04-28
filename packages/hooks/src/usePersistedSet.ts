import { createSignal, type Accessor } from 'solid-js';
import { safeStorageRead, safeStorageWrite } from './_internal/safeStorage';

export interface UsePersistedSetOptions<T> {
  serialize?: (v: T) => string;
  deserialize?: (s: string) => T;
}

export interface UsePersistedSetReturn<T> {
  set: Accessor<Set<T>>;
  toggle: (value: T) => void;
  add: (value: T) => void;
  remove: (value: T) => void;
  clear: () => void;
}

/**
 * A `Set<T>` backed by localStorage. Defaults to `Set<string>` with identity serialization.
 * The full set is persisted on every mutation.
 *
 * @example
 *   const expanded = usePersistedSet<string>('myapp:expanded');
 *   expanded.toggle('panel-1');
 *
 *   const selectedIds = usePersistedSet<number>('myapp:selected', {
 *     serialize: String,
 *     deserialize: Number,
 *   });
 */
export function usePersistedSet<T = string>(
  storageKey: string,
  options: UsePersistedSetOptions<T> = {},
): UsePersistedSetReturn<T> {
  const serialize = options.serialize ?? ((v: T) => v as unknown as string);
  const deserialize = options.deserialize ?? ((s: string) => s as unknown as T);

  const [set, setSet] = createSignal<Set<T>>(
    safeStorageRead(
      storageKey,
      (raw) => new Set((JSON.parse(raw) as string[]).map(deserialize)),
      new Set<T>(),
    ),
  );

  const persist = (next: Set<T>): void => {
    safeStorageWrite(storageKey, JSON.stringify([...next].map(serialize)));
  };

  const toggle = (value: T): void => {
    const next = new Set(set());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    persist(next);
    setSet(next);
  };

  const add = (value: T): void => {
    if (set().has(value)) return;
    const next = new Set(set());
    next.add(value);
    persist(next);
    setSet(next);
  };

  const remove = (value: T): void => {
    if (!set().has(value)) return;
    const next = new Set(set());
    next.delete(value);
    persist(next);
    setSet(next);
  };

  const clear = (): void => {
    persist(new Set<T>());
    setSet(new Set<T>());
  };

  return { set, toggle, add, remove, clear };
}
