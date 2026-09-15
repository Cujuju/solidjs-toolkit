/** Pure state helpers for tri-state chips, reusable in stores and tests without rendering
 *  {@link TriStateChip}. */

export type TriState = 'unselected' | 'included' | 'excluded';

/** Two disjoint sets representing tri-state filter values across a set of
 *  options. An item appears in at most one of `included` / `excluded`; absence
 *  from both implies `unselected`. */
export interface TriStateValue {
  included: string[];
  excluded: string[];
}

/** Neutral / empty tri-state value. Not frozen — callers that need to mutate
 *  should clone via `{ ...EMPTY_TRI_STATE }`. The shared instance is safe to
 *  pass straight to setters whose stores do reference-equality short-circuits. */
export const EMPTY_TRI_STATE: TriStateValue = { included: [], excluded: [] };

/** Default cycle order: unselected → included → excluded → unselected. */
export function cycleTriState(current: TriState): TriState {
  if (current === 'unselected') return 'included';
  if (current === 'included') return 'excluded';
  return 'unselected';
}

/** Read the tri-state of `item` from `value`. O(n) over each set; for hot
 *  loops over many items, prefer building a Map<string, TriState> from
 *  `value` once. */
export function tristateOf(value: TriStateValue, item: string): TriState {
  if (value.included.includes(item)) return 'included';
  if (value.excluded.includes(item)) return 'excluded';
  return 'unselected';
}

/** Return a NEW {@link TriStateValue} with `item` in `next`. Removes `item` from both sets
 *  first, so disjointness holds even for invalid input; other items keep order. */
export function applyTriState(
  value: TriStateValue,
  item: string,
  next: TriState,
): TriStateValue {
  const included = value.included.filter((x) => x !== item);
  const excluded = value.excluded.filter((x) => x !== item);
  if (next === 'included') included.push(item);
  if (next === 'excluded') excluded.push(item);
  return { included, excluded };
}
