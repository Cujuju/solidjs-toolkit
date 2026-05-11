/**
 * Pure state helpers for the tri-state chip pattern.
 *
 * A tri-state chip cycles through three states: `unselected` → `included` →
 * `excluded` → `unselected`. Consumers track a {@link TriStateValue} (two
 * disjoint string sets, one for included items, one for excluded items) and
 * map each option to its current state via {@link tristateOf}. UI rendering
 * (the chip itself) is in {@link TriStateChip}; state transitions are these
 * pure helpers so they can be reused in stores, tests, and callsites that
 * don't render the chip directly.
 */

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

/** Return a NEW {@link TriStateValue} with `item` placed into the `next`
 *  state. Always removes `item` from both sets first to guarantee the
 *  disjoint invariant, even if the caller passes a value that already
 *  violates it. Stable string order within each set is preserved for items
 *  other than `item`. */
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
