/**
 * localStorage read/write primitives that swallow errors (SSR, disabled
 * storage, quota exceeded, corrupted JSON) and fall back to a default.
 *
 * All hooks in this package that touch localStorage go through these
 * helpers so error-handling policy lives in one place. If we ever want
 * to log errors, add a storage-event listener for cross-tab sync, or
 * switch to a different storage backend, only this file changes.
 */

/**
 * Reads a stored value. If the key is missing, storage is unavailable,
 * or the stored raw string can't be deserialized, returns `fallback`.
 */
export function safeStorageRead<T>(
  key: string,
  deserialize: (raw: string) => T,
  fallback: T,
): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
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
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, raw);
  } catch {
    // quota or unavailable — silent
  }
}
