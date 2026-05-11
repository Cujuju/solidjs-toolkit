import { describe, it, expect } from 'vitest';
import {
  cycleTriState,
  tristateOf,
  applyTriState,
  EMPTY_TRI_STATE,
} from '../cycleTriState';

describe('cycleTriState', () => {
  it('unselected → included', () => {
    expect(cycleTriState('unselected')).toBe('included');
  });

  it('included → excluded', () => {
    expect(cycleTriState('included')).toBe('excluded');
  });

  it('excluded → unselected', () => {
    expect(cycleTriState('excluded')).toBe('unselected');
  });

  it('full revolution returns to start', () => {
    expect(cycleTriState(cycleTriState(cycleTriState('unselected')))).toBe('unselected');
  });
});

describe('tristateOf', () => {
  it('returns "included" when item is in included set', () => {
    expect(tristateOf({ included: ['a', 'b'], excluded: [] }, 'a')).toBe('included');
  });

  it('returns "excluded" when item is in excluded set', () => {
    expect(tristateOf({ included: [], excluded: ['a'] }, 'a')).toBe('excluded');
  });

  it('returns "unselected" when item is in neither set', () => {
    expect(tristateOf({ included: ['x'], excluded: ['y'] }, 'z')).toBe('unselected');
  });

  it('returns "unselected" for an empty value', () => {
    expect(tristateOf(EMPTY_TRI_STATE, 'anything')).toBe('unselected');
  });
});

describe('applyTriState', () => {
  it('places item into included set when next=included', () => {
    expect(applyTriState(EMPTY_TRI_STATE, 'a', 'included')).toEqual({
      included: ['a'],
      excluded: [],
    });
  });

  it('places item into excluded set when next=excluded', () => {
    expect(applyTriState(EMPTY_TRI_STATE, 'a', 'excluded')).toEqual({
      included: [],
      excluded: ['a'],
    });
  });

  it('removes item from both sets when next=unselected', () => {
    expect(
      applyTriState({ included: ['a'], excluded: [] }, 'a', 'unselected'),
    ).toEqual(EMPTY_TRI_STATE);
  });

  it('moves item from included to excluded without duplicating', () => {
    const value = { included: ['a', 'b'], excluded: [] };
    expect(applyTriState(value, 'a', 'excluded')).toEqual({
      included: ['b'],
      excluded: ['a'],
    });
  });

  it('moves item from excluded to included without duplicating', () => {
    const value = { included: [], excluded: ['a', 'b'] };
    expect(applyTriState(value, 'a', 'included')).toEqual({
      included: ['a'],
      excluded: ['b'],
    });
  });

  it('returns a new object (does not mutate input)', () => {
    const value = { included: ['a'], excluded: ['b'] };
    const out = applyTriState(value, 'c', 'included');
    expect(out).not.toBe(value);
    expect(out.included).not.toBe(value.included);
    expect(out.excluded).not.toBe(value.excluded);
    expect(value).toEqual({ included: ['a'], excluded: ['b'] });
  });

  it('preserves disjoint invariant even if input violates it', () => {
    // Defensive: caller passes a value with the same item in both sets.
    // applyTriState should not double-place after the next assignment.
    const dirty = { included: ['a'], excluded: ['a'] };
    expect(applyTriState(dirty, 'a', 'included')).toEqual({
      included: ['a'],
      excluded: [],
    });
  });

  it('preserves stable order of other items', () => {
    const value = { included: ['z', 'a', 'm'], excluded: [] };
    expect(applyTriState(value, 'a', 'excluded')).toEqual({
      included: ['z', 'm'],
      excluded: ['a'],
    });
  });
});

describe('EMPTY_TRI_STATE', () => {
  it('shape is two empty arrays', () => {
    expect(EMPTY_TRI_STATE).toEqual({ included: [], excluded: [] });
  });

  it('is not frozen (callers may spread to clone)', () => {
    // Documented contract — spread-clone is the recommended mutation entry,
    // but the instance itself is intentionally not Object.frozen so callers
    // that pass it straight to a setter don't crash if the store mutates.
    expect(Object.isFrozen(EMPTY_TRI_STATE)).toBe(false);
  });
});
