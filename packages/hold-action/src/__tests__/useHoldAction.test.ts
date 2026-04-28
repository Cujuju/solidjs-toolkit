import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useHoldAction } from '../useHoldAction';

/**
 * Test harness: one shared clock drives both `performance.now()` and the
 * requestAnimationFrame callbacks. Advance time via `setTime()`; pending
 * RAF callbacks are drained immediately (as if we're at the next frame).
 */
interface Harness {
  setTime: (ms: number) => void;
  flushRaf: () => void;
  restore: () => void;
}

function installHarness(): Harness {
  let now = 0;
  let pending: Array<FrameRequestCallback> = [];

  const originalNow = performance.now.bind(performance);
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;
  const ids = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  (performance.now as unknown as () => number) = () => now;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextId++;
    ids.set(id, cb);
    pending.push(cb);
    return id;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    const cb = ids.get(id);
    if (cb) {
      ids.delete(id);
      pending = pending.filter((x) => x !== cb);
    }
  }) as typeof cancelAnimationFrame;

  const flushRaf = (): void => {
    const batch = pending;
    pending = [];
    for (const cb of batch) cb(now);
  };

  return {
    setTime: (ms: number) => {
      now = ms;
    },
    flushRaf,
    restore: () => {
      (performance.now as unknown as () => number) = originalNow;
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCaf;
    },
  };
}

describe('useHoldAction', () => {
  let h: Harness;
  beforeEach(() => { h = installHarness(); });
  afterEach(() => { h.restore(); });

  it('onComplete fires exactly once when hold duration elapses', () => {
    const onComplete = vi.fn();
    createRoot(() => {
      const hold = useHoldAction({ durationMs: 100, onComplete });
      h.setTime(0);
      hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
      h.flushRaf(); // tick at t=0
      h.setTime(50);
      h.flushRaf();
      expect(onComplete).not.toHaveBeenCalled();
      h.setTime(100);
      h.flushRaf();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('onComplete does NOT fire if hold is cancelled before duration', () => {
    const onComplete = vi.fn();
    createRoot(() => {
      const hold = useHoldAction({ durationMs: 100, onComplete });
      h.setTime(0);
      hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
      h.flushRaf();
      h.setTime(50);
      h.flushRaf();
      hold.handlers.onPointerUp({} as PointerEvent);
      h.setTime(150);
      h.flushRaf();
      expect(onComplete).not.toHaveBeenCalled();
      expect(hold.holding()).toBe(false);
    });
  });

  it('stages fire in order as their at-thresholds are crossed', () => {
    const stageA = vi.fn();
    const stageB = vi.fn();
    const onComplete = vi.fn();
    createRoot(() => {
      const hold = useHoldAction({
        durationMs: 300,
        onComplete,
        stages: [
          { at: 100, onReach: stageA },
          { at: 200, onReach: stageB },
        ],
      });
      h.setTime(0);
      hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
      h.flushRaf();
      expect(stageA).not.toHaveBeenCalled();
      h.setTime(100);
      h.flushRaf();
      expect(stageA).toHaveBeenCalledTimes(1);
      expect(stageB).not.toHaveBeenCalled();
      h.setTime(200);
      h.flushRaf();
      expect(stageB).toHaveBeenCalledTimes(1);
      h.setTime(300);
      h.flushRaf();
      expect(onComplete).toHaveBeenCalledTimes(1);
      // Each stage fires exactly once
      expect(stageA).toHaveBeenCalledTimes(1);
      expect(stageB).toHaveBeenCalledTimes(1);
    });
  });

  it('shouldSuppressClick returns true ONCE after a completed hold, then false', () => {
    const onComplete = vi.fn();
    createRoot(() => {
      const hold = useHoldAction({ durationMs: 100, onComplete });
      h.setTime(0);
      hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
      h.flushRaf();
      h.setTime(100);
      h.flushRaf();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(hold.shouldSuppressClick()).toBe(true);
      expect(hold.shouldSuppressClick()).toBe(false);
    });
  });

  it('shouldSuppressClick returns false when suppressClickAfterComplete=false', () => {
    createRoot(() => {
      const hold = useHoldAction({
        durationMs: 100,
        onComplete: () => {},
        suppressClickAfterComplete: false,
      });
      h.setTime(0);
      hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
      h.flushRaf();
      h.setTime(100);
      h.flushRaf();
      expect(hold.shouldSuppressClick()).toBe(false);
    });
  });

  it('enabled=false prevents hold from starting', () => {
    const onComplete = vi.fn();
    createRoot(() => {
      const hold = useHoldAction({
        durationMs: 100,
        onComplete,
        enabled: () => false,
      });
      hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
      expect(hold.holding()).toBe(false);
      h.setTime(200);
      h.flushRaf();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  it('non-left button is ignored', () => {
    createRoot(() => {
      const hold = useHoldAction({ durationMs: 100, onComplete: () => {} });
      hold.handlers.onPointerDown({ button: 2 } as PointerEvent);
      expect(hold.holding()).toBe(false);
    });
  });

  // ─── onCancel callback ──────────────────────────────────────────────────

  describe('onCancel', () => {
    it('fires when pointerup mid-hold (user released early)', () => {
      const onCancel = vi.fn();
      const onComplete = vi.fn();
      createRoot(() => {
        const hold = useHoldAction({ durationMs: 100, onComplete, onCancel });
        h.setTime(0);
        hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
        h.flushRaf();
        h.setTime(50); // half-way
        h.flushRaf();
        hold.handlers.onPointerUp({ button: 0 } as PointerEvent);
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onComplete).not.toHaveBeenCalled();
      });
    });

    it('fires when pointerleave mid-hold (with cancelOnLeave=true, the default)', () => {
      const onCancel = vi.fn();
      createRoot(() => {
        const hold = useHoldAction({ durationMs: 100, onComplete: () => {}, onCancel });
        h.setTime(0);
        hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
        h.flushRaf();
        h.setTime(50);
        h.flushRaf();
        hold.handlers.onPointerLeave({} as PointerEvent);
        expect(onCancel).toHaveBeenCalledTimes(1);
      });
    });

    it('fires when imperative cancel() called mid-hold', () => {
      const onCancel = vi.fn();
      createRoot(() => {
        const hold = useHoldAction({ durationMs: 100, onComplete: () => {}, onCancel });
        h.setTime(0);
        hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
        h.flushRaf();
        h.setTime(50);
        h.flushRaf();
        hold.cancel();
        expect(onCancel).toHaveBeenCalledTimes(1);
      });
    });

    it('does NOT fire after onComplete (a trailing pointerup is a no-op)', () => {
      const onCancel = vi.fn();
      const onComplete = vi.fn();
      createRoot(() => {
        const hold = useHoldAction({ durationMs: 100, onComplete, onCancel });
        h.setTime(0);
        hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
        h.flushRaf();
        h.setTime(100); // reach completion
        h.flushRaf();
        expect(onComplete).toHaveBeenCalledTimes(1);
        // Trailing pointerup arrives after completion — must not retro-fire onCancel.
        hold.handlers.onPointerUp({ button: 0 } as PointerEvent);
        expect(onCancel).not.toHaveBeenCalled();
      });
    });

    it('does NOT fire on component cleanup (consumer would run against a dead tree)', () => {
      const onCancel = vi.fn();
      const dispose = createRoot((d) => {
        const hold = useHoldAction({ durationMs: 100, onComplete: () => {}, onCancel });
        h.setTime(0);
        hold.handlers.onPointerDown({ button: 0 } as PointerEvent);
        h.flushRaf();
        h.setTime(50); // mid-hold
        h.flushRaf();
        return d;
      });
      dispose();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
