import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { createAfterPaint } from '../createAfterPaint';

/** Wait for the next animation frame so scheduled callbacks fire. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('createAfterPaint', () => {
  it('schedules fn to fire on next animation frame', async () => {
    const fn = vi.fn();
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      const schedule = createAfterPaint();
      schedule(fn);
      // Synchronous: not yet fired.
      expect(fn).not.toHaveBeenCalled();
    });
    await nextFrame();
    expect(fn).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('supersede: second schedule before frame cancels first', async () => {
    const a = vi.fn();
    const b = vi.fn();
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      const schedule = createAfterPaint();
      schedule(a);
      schedule(b);
    });
    await nextFrame();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('cleanup cancels pending frame', async () => {
    const fn = vi.fn();
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      const schedule = createAfterPaint();
      schedule(fn);
    });
    dispose();
    await nextFrame();
    expect(fn).not.toHaveBeenCalled();
  });

  it('cleanup is idempotent (no double-cancel throw)', async () => {
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      const schedule = createAfterPaint();
      schedule(() => {});
    });
    dispose();
    await nextFrame();
    // Second dispose call is a no-op for Solid roots; the cleanup itself
    // guards by nulling id before cancel runs again.
    expect(() => dispose()).not.toThrow();
  });

  it('two independent instances do not share state', async () => {
    const a = vi.fn();
    const b = vi.fn();
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      const schedA = createAfterPaint();
      const schedB = createAfterPaint();
      schedA(a);
      schedB(b);
    });
    await nextFrame();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('post-fire schedule fires on the subsequent frame', async () => {
    const a = vi.fn();
    const b = vi.fn();
    let schedule!: (fn: () => void) => void;
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      schedule = createAfterPaint();
      schedule(a);
    });
    await nextFrame();
    expect(a).toHaveBeenCalledTimes(1);

    schedule(b);
    expect(b).not.toHaveBeenCalled();
    await nextFrame();
    expect(b).toHaveBeenCalledTimes(1);
    dispose();
  });
});
