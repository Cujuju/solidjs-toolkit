import { afterEach, describe, expect, it } from 'vitest';
import { ACCORDION_LAYOUT_VERSION } from '../context';
import { readPersisted, writePersisted } from '../persistence';

const KEY = 'persistence-test';
const VALID = { version: ACCORDION_LAYOUT_VERSION, open: ['a'], pinned: ['b'], order: ['a', 'b'], sizes: { a: 120 } };

afterEach(() => localStorage.clear());

describe('readPersisted', () => {
  it('returns null without a key or a stored value', () => {
    expect(readPersisted(undefined)).toBeNull();
    expect(readPersisted(KEY)).toBeNull();
  });

  it('round-trips a layout written by writePersisted', () => {
    writePersisted(KEY, VALID);
    expect(readPersisted(KEY)).toEqual(VALID);
  });

  it('rejects corrupt JSON, non-objects and other versions', () => {
    for (const raw of ['{not json', 'null', '42', JSON.stringify({ ...VALID, version: ACCORDION_LAYOUT_VERSION + 1 })]) {
      localStorage.setItem(KEY, raw);
      expect(readPersisted(KEY), raw).toBeNull();
    }
  });

  it('keeps only string ids and finite sizes', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: ACCORDION_LAYOUT_VERSION,
      open: ['a', 1, null],
      pinned: 'b',
      order: ['a', { id: 'b' }],
      sizes: { a: 120, b: 'wide', c: null },
    }));
    expect(readPersisted(KEY)).toEqual({ version: ACCORDION_LAYOUT_VERSION, open: ['a'], pinned: [], order: ['a'], sizes: { a: 120 } });
  });
});
