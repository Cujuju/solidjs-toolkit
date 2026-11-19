import { describe, expect, it, vi } from 'vitest';
import { aimRegion, createAimLock, isInAimRegion } from '../_internal/submenuAim.js';
import { submenuCloseDelayMs } from '../submenuTiming.js';

const FLYOUT = { left: 200, right: 400, top: 0, bottom: 300 };

describe('aimRegion', () => {
  it('bases a right-hand flyout on its left edge', () => {
    const r = aimRegion(150, 28, FLYOUT)!;
    expect(r.baseX).toBe(200);
    expect(r.apexX).toBeLessThan(150);
  });

  it('bases a left-hand flyout on its right edge', () => {
    const r = aimRegion(450, 28, FLYOUT)!;
    expect(r.baseX).toBe(400);
    expect(r.apexX).toBeGreaterThan(450);
  });

  it('has no region when the exit point is within the flyout span', () => {
    expect(aimRegion(300, 28, FLYOUT)).toBeNull();
  });

  it('grants the unhurried travel time to the farther base corner', () => {
    expect(aimRegion(150, 28, FLYOUT)!.graceMs).toBe(submenuCloseDelayMs(Math.hypot(50, 272)));
  });
});

describe('isInAimRegion', () => {
  const r = aimRegion(150, 28, FLYOUT)!;

  it('contains the exit point and a 1px step in any direction toward the flyout', () => {
    expect(isInAimRegion(r, 150, 28)).toBe(true);
    expect(isInAimRegion(r, 151, 29)).toBe(true);
    expect(isInAimRegion(r, 151, 27)).toBe(true);
  });

  it('contains a diagonal heading for the flyout', () => {
    expect(isInAimRegion(r, 170, 40)).toBe(true);
    expect(isInAimRegion(r, 195, 200)).toBe(true);
  });

  it('excludes a move straight down, a move back, and points past the base', () => {
    expect(isInAimRegion(r, 150, 40)).toBe(false);
    expect(isInAimRegion(r, 140, 28)).toBe(false);
    expect(isInAimRegion(r, 201, 100)).toBe(false);
  });

  it('includes the base edge and excludes beyond the flyout corners', () => {
    expect(isInAimRegion(r, 200, 0)).toBe(true);
    expect(isInAimRegion(r, 200, 300)).toBe(true);
    expect(isInAimRegion(r, 200, 301)).toBe(false);
  });

  it('mirrors for a left-hand flyout', () => {
    const left = aimRegion(450, 28, FLYOUT)!;
    expect(isInAimRegion(left, 430, 40)).toBe(true);
    expect(isInAimRegion(left, 450, 40)).toBe(false);
  });
});

describe('createAimLock', () => {
  const A = Symbol('a');
  const B = Symbol('b');

  function lock(active?: symbol) {
    let current = active;
    const setActive = vi.fn((v: symbol | undefined | ((p: symbol | undefined) => symbol | undefined)) => {
      current = typeof v === 'function' ? v(current) : v;
      return current;
    });
    return { l: createAimLock(setActive as never), current: () => current };
  }

  it('opens at once with no holder', () => {
    const { l, current } = lock();
    l.request(A);
    expect(current()).toBe(A);
  });

  it('defers a sibling while another holds, and hands off on release', () => {
    const { l, current } = lock(A);
    l.hold(A);
    l.request(B);
    expect(current()).toBe(A);
    l.release(A, true);
    expect(current()).toBe(B);
  });

  it('closes the holder on hand-off when no sibling waits', () => {
    const { l, current } = lock(A);
    l.hold(A);
    l.release(A, true);
    expect(current()).toBeUndefined();
  });

  it('keeps the holder and drops the waiting sibling on release without hand-off', () => {
    const { l, current } = lock(A);
    l.hold(A);
    l.request(B);
    l.release(A, false);
    expect(current()).toBe(A);
    l.request(B);
    expect(current()).toBe(B);
  });

  it('forgets a withdrawn sibling', () => {
    const { l, current } = lock(A);
    l.hold(A);
    l.request(B);
    l.withdraw(B);
    l.release(A, true);
    expect(current()).toBeUndefined();
  });

  it('ignores a release from a non-holder', () => {
    const { l, current } = lock(A);
    l.hold(A);
    l.release(B, true);
    expect(current()).toBe(A);
  });
});
