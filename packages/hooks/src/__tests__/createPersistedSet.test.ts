import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createPersistedSet } from '../createPersistedSet';
import { installLocalStorageMock } from './testUtils';

const KEY = 'createPersistedSet-test';

describe('createPersistedSet', () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it('starts empty when storage is empty', () => {
    createRoot(() => {
      const s = createPersistedSet(KEY);
      expect(s.set().size).toBe(0);
    });
  });

  it('loads existing values from storage', () => {
    localStorage.setItem(KEY, JSON.stringify(['a', 'b']));
    createRoot(() => {
      const s = createPersistedSet(KEY);
      expect(s.set().has('a')).toBe(true);
      expect(s.set().has('b')).toBe(true);
    });
  });

  it('toggle adds when missing, removes when present', () => {
    createRoot(() => {
      const s = createPersistedSet(KEY);
      s.toggle('a');
      expect(s.set().has('a')).toBe(true);
      s.toggle('a');
      expect(s.set().has('a')).toBe(false);
    });
  });

  it('add is idempotent', () => {
    createRoot(() => {
      const s = createPersistedSet(KEY);
      s.add('a');
      s.add('a');
      expect(s.set().size).toBe(1);
    });
  });

  it('remove is idempotent', () => {
    createRoot(() => {
      const s = createPersistedSet(KEY);
      s.remove('missing');
      expect(s.set().size).toBe(0);
    });
  });

  it('persists to storage on mutation', () => {
    createRoot(() => {
      const s = createPersistedSet(KEY);
      s.add('a');
      expect(localStorage.getItem(KEY)).toBe(JSON.stringify(['a']));
    });
  });

  it('clear empties the set and storage', () => {
    createRoot(() => {
      const s = createPersistedSet(KEY);
      s.add('a');
      s.add('b');
      s.clear();
      expect(s.set().size).toBe(0);
      expect(localStorage.getItem(KEY)).toBe(JSON.stringify([]));
    });
  });

  it('supports custom serializers for non-string types', () => {
    createRoot(() => {
      const s = createPersistedSet<number>(KEY, {
        serialize: String,
        deserialize: Number,
      });
      s.add(1);
      s.add(2);
      expect(s.set().has(1)).toBe(true);
      expect(localStorage.getItem(KEY)).toBe(JSON.stringify(['1', '2']));
    });
  });
});
