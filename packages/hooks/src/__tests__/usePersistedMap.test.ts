import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { usePersistedMap } from '../usePersistedMap';
import { installLocalStorageMock } from './testUtils';

const KEY = 'usePersistedMap-test';

describe('usePersistedMap', () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it('starts empty when storage is empty', () => {
    createRoot(() => {
      const m = usePersistedMap(KEY);
      expect(m.map().size).toBe(0);
    });
  });

  it('set and get roundtrip', () => {
    createRoot(() => {
      const m = usePersistedMap<string, string>(KEY);
      m.set('a', 'apple');
      expect(m.get('a')).toBe('apple');
    });
  });

  it('persists across signals', () => {
    localStorage.setItem(KEY, JSON.stringify([['a', 'apple']]));
    createRoot(() => {
      const m = usePersistedMap<string, string>(KEY);
      expect(m.get('a')).toBe('apple');
    });
  });

  it('has returns correct presence', () => {
    createRoot(() => {
      const m = usePersistedMap<string, string>(KEY);
      m.set('a', 'apple');
      expect(m.has('a')).toBe(true);
      expect(m.has('b')).toBe(false);
    });
  });

  it('remove deletes entry', () => {
    createRoot(() => {
      const m = usePersistedMap<string, string>(KEY);
      m.set('a', 'apple');
      m.remove('a');
      expect(m.has('a')).toBe(false);
    });
  });

  it('clear empties the map and storage', () => {
    createRoot(() => {
      const m = usePersistedMap<string, string>(KEY);
      m.set('a', 'apple');
      m.clear();
      expect(m.map().size).toBe(0);
      expect(localStorage.getItem(KEY)).toBe(JSON.stringify([]));
    });
  });

  it('supports custom serializers', () => {
    createRoot(() => {
      const m = usePersistedMap<number, number>(KEY, {
        serializeKey: String,
        deserializeKey: Number,
        serializeValue: String,
        deserializeValue: Number,
      });
      m.set(1, 100);
      expect(m.get(1)).toBe(100);
    });
  });
});
