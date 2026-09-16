import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { createDebounce } from '../createDebounce';

// Fake timers race Solid's scheduler; flush microtasks between reactive updates and timer advances.
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial value matches source', () => {
    createRoot(() => {
      const [src] = createSignal('hello');
      const debounced = createDebounce(src, 100);
      expect(debounced()).toBe('hello');
    });
  });

  it('emits updated value after delay', async () => {
    await createRoot(async (dispose) => {
      const [src, setSrc] = createSignal('a');
      const debounced = createDebounce(src, 100);
      setSrc('b');
      await flush();
      expect(debounced()).toBe('a'); // still within delay window
      vi.advanceTimersByTime(100);
      await flush();
      expect(debounced()).toBe('b');
      dispose();
    });
  });

  it('rapid source changes reset the timer', async () => {
    await createRoot(async (dispose) => {
      const [src, setSrc] = createSignal('a');
      const debounced = createDebounce(src, 100);
      setSrc('b');
      await flush();
      vi.advanceTimersByTime(50);
      setSrc('c');
      await flush();
      vi.advanceTimersByTime(50);
      await flush();
      expect(debounced()).toBe('a'); // reset, still not fired
      vi.advanceTimersByTime(50);
      await flush();
      expect(debounced()).toBe('c');
      dispose();
    });
  });
});
