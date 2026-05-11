import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { createMediaQuery } from '../createMediaQuery';

describe('createMediaQuery', () => {
  it('returns an accessor without throwing', () => {
    // happy-dom's matchMedia returns matches=false for all queries, so this is
    // mostly a smoke test that the hook wires up without erroring.
    createRoot(() => {
      const matches = createMediaQuery('(min-width: 768px)');
      expect(typeof matches).toBe('function');
      expect(typeof matches()).toBe('boolean');
    });
  });
});
