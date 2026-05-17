import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_MENU_TINT_STORAGE_KEY,
  MENU_TINT_DEFAULTS,
  MENU_TINT_DEFAULT_DARKEN,
  MENU_TINT_DEFAULT_BLUR,
  MENU_TINT_DARKEN_MAX,
  MENU_TINT_DARKEN_CSS_VAR,
  MENU_TINT_BLUR_CSS_VAR,
  type MenuTintKnobs,
  normalizeMenuTintKnobs,
  knobsEqual,
  readMenuTintKnobsFromStorage,
  writeMenuTintKnobsToStorage,
  clearMenuTintKnobsFromStorage,
  applyMenuTintKnobs,
} from '../menuTint';

describe('normalizeMenuTintKnobs', () => {
  it('clamps out-of-range fields to the knob range', () => {
    const n = normalizeMenuTintKnobs({
      darken: 999,
      alpha: -10,
      saturate: 5,
      backdropSaturate: -1,
      blur: 100,
    });
    expect(n.darken).toBe(MENU_TINT_DARKEN_MAX);
    expect(n.alpha).toBe(5); // MENU_TINT_ALPHA_MIN
    expect(n.saturate).toBe(2);
    expect(n.backdropSaturate).toBe(0);
    expect(n.blur).toBe(30);
  });

  it('falls back to defaults for missing fields', () => {
    expect(normalizeMenuTintKnobs({})).toEqual(MENU_TINT_DEFAULTS);
  });

  it('falls back to defaults for NaN / Infinity / wrong type', () => {
    const n = normalizeMenuTintKnobs({
      darken: NaN,
      alpha: Infinity,
      saturate: 'x',
      backdropSaturate: null,
      blur: undefined,
    });
    expect(n).toEqual(MENU_TINT_DEFAULTS);
  });

  it('treats non-object input as empty', () => {
    expect(normalizeMenuTintKnobs(null)).toEqual(MENU_TINT_DEFAULTS);
    expect(normalizeMenuTintKnobs('garbage')).toEqual(MENU_TINT_DEFAULTS);
  });
});

describe('knobsEqual', () => {
  it('is true for identical knob sets', () => {
    expect(knobsEqual(MENU_TINT_DEFAULTS, { ...MENU_TINT_DEFAULTS })).toBe(true);
  });

  it('is false when any field differs', () => {
    expect(
      knobsEqual(MENU_TINT_DEFAULTS, { ...MENU_TINT_DEFAULTS, blur: 0 }),
    ).toBe(false);
  });
});

/** Install a fresh in-memory `localStorage` on `window` before each
 *  test. The engine wraps `window.localStorage`; testing against an
 *  explicit mock keeps these contract tests independent of whichever
 *  Storage implementation the test environment happens to provide. */
function installMockLocalStorage(): void {
  const store = new Map<string, string>();
  const mock: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: mock,
    configurable: true,
    writable: true,
  });
}

describe('storage round-trip', () => {
  beforeEach(() => {
    installMockLocalStorage();
  });

  it('reads back what was written under the default key', () => {
    const knobs: MenuTintKnobs = {
      darken: 20,
      alpha: 40,
      saturate: 1.5,
      backdropSaturate: 0.5,
      blur: 6,
    };
    writeMenuTintKnobsToStorage(knobs);
    expect(readMenuTintKnobsFromStorage()).toEqual(knobs);
    expect(
      window.localStorage.getItem(DEFAULT_MENU_TINT_STORAGE_KEY),
    ).not.toBeNull();
  });

  it('honors a caller-supplied storageKey and isolates it from the default key', () => {
    const knobs = { ...MENU_TINT_DEFAULTS, darken: 12 };
    writeMenuTintKnobsToStorage(knobs, 'host:custom');
    expect(readMenuTintKnobsFromStorage('host:custom')).toEqual(knobs);
    expect(readMenuTintKnobsFromStorage()).toBeNull();
  });

  it('returns null for an absent key', () => {
    expect(readMenuTintKnobsFromStorage('host:missing')).toBeNull();
  });

  it('returns null for garbage JSON', () => {
    window.localStorage.setItem('host:bad', '{not json');
    expect(readMenuTintKnobsFromStorage('host:bad')).toBeNull();
  });

  it('normalizes out-of-range values on write so the stored shape stays valid', () => {
    writeMenuTintKnobsToStorage(
      { darken: 999, alpha: 40, saturate: 1, backdropSaturate: 1, blur: 10 },
      'host:clamp',
    );
    expect(readMenuTintKnobsFromStorage('host:clamp')!.darken).toBe(
      MENU_TINT_DARKEN_MAX,
    );
  });

  it('clears a key', () => {
    writeMenuTintKnobsToStorage(MENU_TINT_DEFAULTS, 'host:clearme');
    clearMenuTintKnobsFromStorage('host:clearme');
    expect(readMenuTintKnobsFromStorage('host:clearme')).toBeNull();
  });
});

describe('applyMenuTintKnobs', () => {
  it('writes the knob CSS variables onto documentElement with units', () => {
    applyMenuTintKnobs({
      darken: 25,
      alpha: 30,
      saturate: 1,
      backdropSaturate: 0.8,
      blur: 12,
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue(MENU_TINT_DARKEN_CSS_VAR)).toBe('25%');
    expect(style.getPropertyValue(MENU_TINT_BLUR_CSS_VAR)).toBe('12px');
  });

  it('removes all overrides when passed null', () => {
    applyMenuTintKnobs(MENU_TINT_DEFAULTS);
    applyMenuTintKnobs(null);
    const style = document.documentElement.style;
    expect(style.getPropertyValue(MENU_TINT_DARKEN_CSS_VAR)).toBe('');
    expect(style.getPropertyValue(MENU_TINT_BLUR_CSS_VAR)).toBe('');
  });

  it('uses the documented default darken/blur in MENU_TINT_DEFAULTS', () => {
    expect(MENU_TINT_DEFAULTS.darken).toBe(MENU_TINT_DEFAULT_DARKEN);
    expect(MENU_TINT_DEFAULTS.blur).toBe(MENU_TINT_DEFAULT_BLUR);
  });
});
