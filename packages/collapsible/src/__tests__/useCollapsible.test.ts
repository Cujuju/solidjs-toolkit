import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { useCollapsible } from '../useCollapsible';

// In-memory localStorage mock — matches pattern used in cujuju-solidjs-hooks tests.
function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  const mock = {
    get length() { return store.size; },
    clear(): void { store.clear(); },
    getItem(k: string): string | null { return store.has(k) ? (store.get(k) as string) : null; },
    setItem(k: string, v: string): void { store.set(k, String(v)); },
    removeItem(k: string): void { store.delete(k); },
    key(i: number): string | null { return [...store.keys()][i] ?? null; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
}

describe('useCollapsible', () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  describe('basic state', () => {
    it('defaults to open=true when no storageKey and defaultOpen not set', () => {
      createRoot(() => {
        const c = useCollapsible();
        expect(c.open()).toBe(true);
      });
    });

    it('respects defaultOpen=false', () => {
      createRoot(() => {
        const c = useCollapsible({ defaultOpen: false });
        expect(c.open()).toBe(false);
      });
    });

    it('toggle flips state', () => {
      createRoot(() => {
        const c = useCollapsible({ defaultOpen: false });
        expect(c.open()).toBe(false);
        c.toggle();
        expect(c.open()).toBe(true);
        c.toggle();
        expect(c.open()).toBe(false);
      });
    });

    it('setOpen sets state directly', () => {
      createRoot(() => {
        const c = useCollapsible({ defaultOpen: false });
        c.setOpen(true);
        expect(c.open()).toBe(true);
      });
    });
  });

  describe('persistence', () => {
    it('reads initial state from localStorage', () => {
      localStorage.setItem('myapp:section:foo', 'false');
      createRoot(() => {
        const c = useCollapsible({
          storageKey: 'foo',
          storageKeyPrefix: 'myapp:section:',
        });
        expect(c.open()).toBe(false);
      });
    });

    it('writes to localStorage on toggle', () => {
      createRoot(() => {
        const c = useCollapsible({
          storageKey: 'foo',
          storageKeyPrefix: 'myapp:section:',
        });
        c.toggle();
        expect(localStorage.getItem('myapp:section:foo')).toBe('false');
        c.toggle();
        expect(localStorage.getItem('myapp:section:foo')).toBe('true');
      });
    });

    it('storageKeyPrefix defaults to empty string', () => {
      createRoot(() => {
        const c = useCollapsible({ storageKey: 'bare' });
        c.toggle();
        expect(localStorage.getItem('bare')).toBeTruthy();
      });
    });
  });

  describe('forceOpen semantics', () => {
    it('forceOpen value overrides local state when manuallyToggled is false', () => {
      createRoot(() => {
        const [fo] = createSignal<boolean | null>(true);
        const c = useCollapsible({ defaultOpen: false, forceOpen: fo });
        // Initial effect run captures prevForceOpen but doesn't apply; open reflects local default
        // — the forceOpen is consulted by effectiveOpen directly
        expect(c.open()).toBe(true);
      });
    });

    it('user toggle AFTER forceOpen sticks (manuallyToggled=true)', () => {
      createRoot(() => {
        const [fo] = createSignal<boolean | null>(true);
        const c = useCollapsible({ defaultOpen: false, forceOpen: fo });
        expect(c.open()).toBe(true); // from forceOpen
        c.toggle();
        expect(c.manuallyToggled()).toBe(true);
        expect(c.open()).toBe(false);
      });
    });

    it('forceOpen transitioning to a NEW value resets manuallyToggled', async () => {
      await createRoot(async () => {
        const [fo, setFo] = createSignal<boolean | null | undefined>(true);
        const c = useCollapsible({ defaultOpen: false, forceOpen: fo });
        // Flush effect
        await Promise.resolve();
        c.toggle(); // user overrides
        expect(c.manuallyToggled()).toBe(true);

        // Re-assert same value → no reset
        setFo(true);
        await Promise.resolve();
        expect(c.manuallyToggled()).toBe(true);

        // Transition to NEW value → reset
        setFo(false);
        await Promise.resolve();
        expect(c.manuallyToggled()).toBe(false);
      });
    });

    it('reset() clears manuallyToggled', () => {
      createRoot(() => {
        const [fo] = createSignal<boolean | null>(true);
        const c = useCollapsible({ defaultOpen: false, forceOpen: fo });
        c.toggle();
        expect(c.manuallyToggled()).toBe(true);
        c.reset();
        expect(c.manuallyToggled()).toBe(false);
      });
    });
  });

  describe('onChange callback', () => {
    it('fires on toggle', () => {
      const onChange = (v: boolean): void => { calls.push(v); };
      const calls: boolean[] = [];
      createRoot(() => {
        const c = useCollapsible({ defaultOpen: false, onChange });
        c.toggle();
        c.toggle();
        expect(calls).toEqual([true, false]);
      });
    });
  });
});
