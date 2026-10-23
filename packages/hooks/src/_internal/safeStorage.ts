/** localStorage primitives that swallow errors (SSR, disabled, quota, bad JSON); all storage access goes through here. */

/**
 * Reads a stored value. If the key is missing, storage is unavailable,
 * or the stored raw string can't be deserialized, returns `fallback`.
 */
export function safeStorageRead<T>(
  key: string,
  deserialize: (raw: string) => T,
  fallback: T,
): T {
  // The availability check sits inside `try`: a storage-denied context throws from the getter.
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return deserialize(raw);
  } catch {
    return fallback;
  }
}

/**
 * Writes a serialized value. Silent on quota / SSR / unavailable storage.
 * Does not throw.
 */
export function safeStorageWrite(key: string, raw: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, raw);
  } catch {
    // quota or unavailable — silent
  }
}

/**
 * Removes a stored value. Silent on SSR / unavailable storage.
 * Does not throw.
 */
export function safeStorageRemove(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // unavailable — silent
  }
}
