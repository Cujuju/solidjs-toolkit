/**
 * The element at an index the caller's invariant guarantees, such as one share per child.
 * Throws instead of letting `undefined` flow on as NaN or a missing node.
 */
export function valueAt<T extends {} | null>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`No element at index ${index} of ${values.length}`);
  return value;
}
