/** Test lookup by index: fails with the index and length instead of passing `undefined` on. */
export function valueAt<T extends {} | null>(list: ArrayLike<T>, index: number): T {
  const value = list[index];
  if (value === undefined) throw new RangeError(`Expected an element at index ${index} of ${list.length}`);
  return value;
}

/** Test lookup by key or optional read: fails naming `what` instead of passing `undefined` on. */
export function defined<T extends {} | null>(value: T | undefined, what = 'value'): T {
  if (value === undefined) throw new TypeError(`Expected ${what} to be defined`);
  return value;
}
