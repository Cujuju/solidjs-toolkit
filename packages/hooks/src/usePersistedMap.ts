import { createSignal, type Accessor } from 'solid-js';
import { safeStorageRead, safeStorageWrite } from './_internal/safeStorage';

export interface UsePersistedMapOptions<K, V> {
  serializeKey?: (k: K) => string;
  deserializeKey?: (s: string) => K;
  serializeValue?: (v: V) => string;
  deserializeValue?: (s: string) => V;
}

export interface UsePersistedMapReturn<K, V> {
  map: Accessor<Map<K, V>>;
  set: (key: K, value: V) => void;
  get: (key: K) => V | undefined;
  has: (key: K) => boolean;
  remove: (key: K) => void;
  clear: () => void;
}

/**
 * A `Map<K, V>` backed by localStorage. Defaults assume both K and V are strings.
 * Persisted as a JSON array of `[serializedKey, serializedValue]` pairs.
 */
export function usePersistedMap<K = string, V = string>(
  storageKey: string,
  options: UsePersistedMapOptions<K, V> = {},
): UsePersistedMapReturn<K, V> {
  const sk = options.serializeKey ?? ((k: K) => k as unknown as string);
  const dk = options.deserializeKey ?? ((s: string) => s as unknown as K);
  const sv = options.serializeValue ?? ((v: V) => v as unknown as string);
  const dv = options.deserializeValue ?? ((s: string) => s as unknown as V);

  const [map, setMap] = createSignal<Map<K, V>>(
    safeStorageRead(
      storageKey,
      (raw) => {
        const arr = JSON.parse(raw) as Array<[string, string]>;
        return new Map(arr.map(([k, v]) => [dk(k), dv(v)]));
      },
      new Map<K, V>(),
    ),
  );

  const persist = (next: Map<K, V>): void => {
    const arr = [...next.entries()].map(([k, v]) => [sk(k), sv(v)]);
    safeStorageWrite(storageKey, JSON.stringify(arr));
  };

  const set = (key: K, value: V): void => {
    const next = new Map(map());
    next.set(key, value);
    persist(next);
    setMap(next);
  };

  const get = (key: K): V | undefined => map().get(key);
  const has = (key: K): boolean => map().has(key);

  const remove = (key: K): void => {
    if (!map().has(key)) return;
    const next = new Map(map());
    next.delete(key);
    persist(next);
    setMap(next);
  };

  const clear = (): void => {
    persist(new Map<K, V>());
    setMap(new Map<K, V>());
  };

  return { map, set, get, has, remove, clear };
}
