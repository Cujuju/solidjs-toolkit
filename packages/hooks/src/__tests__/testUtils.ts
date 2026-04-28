// In-memory localStorage mock to bypass Node 22+ native localStorage +
// jsdom/happy-dom inconsistencies. Install before each test file runs.
export function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  const mock = {
    get length() {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(k: string): string | null {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    setItem(k: string, v: string): void {
      store.set(k, String(v));
    },
    removeItem(k: string): void {
      store.delete(k);
    },
    key(i: number): string | null {
      return [...store.keys()][i] ?? null;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  });
}
