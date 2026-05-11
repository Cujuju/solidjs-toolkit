import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createLocalStorage } from '../createLocalStorage';
import { installLocalStorageMock } from './testUtils';

const KEY = 'createLocalStorage-test';

describe('createLocalStorage', () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it('uses default value when key is absent', () => {
    createRoot(() => {
      const [value] = createLocalStorage(KEY, 'default');
      expect(value()).toBe('default');
    });
  });

  it('reads existing value from storage', () => {
    localStorage.setItem(KEY, JSON.stringify('stored'));
    createRoot(() => {
      const [value] = createLocalStorage(KEY, 'default');
      expect(value()).toBe('stored');
    });
  });

  it('writes to storage on set', () => {
    createRoot(() => {
      const [, setValue] = createLocalStorage<string>(KEY, 'default');
      setValue('new');
      expect(localStorage.getItem(KEY)).toBe(JSON.stringify('new'));
    });
  });

  it('updates signal on set', () => {
    createRoot(() => {
      const [value, setValue] = createLocalStorage<string>(KEY, 'default');
      setValue('new');
      expect(value()).toBe('new');
    });
  });

  it('supports functional updates', () => {
    createRoot(() => {
      const [value, setValue] = createLocalStorage<number>(KEY, 1);
      setValue((v) => v + 1);
      expect(value()).toBe(2);
    });
  });

  it('handles corrupted JSON gracefully', () => {
    localStorage.setItem(KEY, '{not-json');
    createRoot(() => {
      const [value] = createLocalStorage(KEY, 'default');
      expect(value()).toBe('default');
    });
  });

  it('stores complex objects', () => {
    createRoot(() => {
      const [value, setValue] = createLocalStorage<{ a: number; b: string }>(KEY, { a: 0, b: 'x' });
      setValue({ a: 1, b: 'y' });
      expect(value()).toEqual({ a: 1, b: 'y' });
    });
  });
});
