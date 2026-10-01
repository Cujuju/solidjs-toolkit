import { describe, expect, it, vi } from 'vitest';
import { createSettle } from '../core/settle';

function harness(over: { inBounds?: () => boolean } = {}) {
  let t = 0;
  let offset = 0;
  let frames: (() => void)[] = [];
  const onSettle = vi.fn();
  const s = createSettle({
    now: () => t,
    frame: (fn) => void frames.push(fn),
    offset: () => offset,
    inBounds: over.inBounds ?? (() => true),
    onSettle,
  });
  /** Advances one 16ms frame. */
  const frame = (): void => {
    t += 16;
    const run = frames;
    frames = [];
    run.forEach((fn) => fn());
  };
  const frameFor = (ms: number): void => {
    for (let end = t + ms; t < end; ) frame();
  };
  return { s, onSettle, frame, frameFor, setOffset: (v: number) => (offset = v), advance: (ms: number) => (t += ms), pending: () => frames.length };
}

describe('createSettle', () => {
  it('settles once the quiet time and frames have both passed', () => {
    const h = harness();
    h.s.activity();
    expect(h.s.busy()).toBe(true);
    h.frameFor(140);
    expect(h.onSettle).not.toHaveBeenCalled();
    h.frameFor(100);
    expect(h.onSettle).toHaveBeenCalledTimes(1);
    expect(h.s.busy()).toBe(false);
    expect(h.pending()).toBe(0);
  });

  it('stays busy while scroll events keep coming (a keyboard or wheel animation)', () => {
    const h = harness();
    for (let i = 0; i < 30; i++) {
      h.s.activity();
      h.frame();
    }
    expect(h.onSettle).not.toHaveBeenCalled();
  });

  it('an offset that keeps changing with no scroll events (sparse momentum events) stays busy', () => {
    const h = harness();
    h.s.activity();
    for (let i = 1; i <= 30; i++) {
      h.setOffset(i * 10);
      h.frame();
    }
    expect(h.onSettle).not.toHaveBeenCalled();
    h.frameFor(300);
    expect(h.onSettle).toHaveBeenCalledTimes(1);
  });

  it('a touch down holds it busy until it lifts, however quiet', () => {
    const h = harness();
    h.s.touches(1);
    for (let i = 0; i < 20; i++) {
      h.s.activity();
      h.frameFor(48);
    }
    expect(h.onSettle).not.toHaveBeenCalled();
    h.s.touches(0);
    h.frameFor(300);
    expect(h.onSettle).toHaveBeenCalledTimes(1);
  });

  it('a lost touch end is cleared by the watchdog', () => {
    const h = harness();
    h.s.touches(1);
    h.frameFor(1200);
    expect(h.onSettle).toHaveBeenCalledTimes(1);
  });

  it('a mouse button down (scrollbar drag) holds it busy until released', () => {
    const h = harness();
    h.s.pointer(true);
    h.frameFor(2000);
    expect(h.onSettle).not.toHaveBeenCalled();
    h.s.pointer(false);
    h.frameFor(300);
    expect(h.onSettle).toHaveBeenCalledTimes(1);
  });

  it('a release with no press is ignored', () => {
    const h = harness();
    h.s.pointer(false);
    expect(h.s.busy()).toBe(false);
    expect(h.pending()).toBe(0);
  });

  it('stays busy while rubber-banding', () => {
    let inBounds = false;
    const h = harness({ inBounds: () => inBounds });
    h.s.activity();
    h.frameFor(500);
    expect(h.onSettle).not.toHaveBeenCalled();
    inBounds = true;
    h.frameFor(300);
    expect(h.onSettle).toHaveBeenCalledTimes(1);
  });

  it('runs one frame loop however much activity arrives', () => {
    const h = harness();
    h.s.activity();
    h.s.activity();
    h.s.touches(0);
    expect(h.pending()).toBe(1);
  });
});
