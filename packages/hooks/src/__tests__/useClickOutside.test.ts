import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useClickOutside } from '../useClickOutside';
import { contains } from '../contains';

/**
 * Dispatch a pointerdown on `el`. happy-dom Event constructor sets
 * `timeStamp = performance.now()`, so events created here are stamped *after*
 * any prior `useClickOutside` attach (which captures `performance.now()` at
 * its own attach time). That gives the timestamp-suppression mechanism real
 * monotonic timestamps to compare against.
 */
const firePointerDown = (el: EventTarget): void => {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
};

describe('useClickOutside', () => {
  // ─── Existing contract (preserved across the refactor) ───────────────────

  it('fires handler on outside pointerdown (predicate-based surface)', () => {
    const handler = vi.fn();
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.appendChild(inner);
    document.body.appendChild(outer);

    createRoot(() => {
      useClickOutside((t) => inner.contains(t), handler);
    });

    firePointerDown(document.body);
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(outer);
  });

  it('does not fire handler when target is inside the surface', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    createRoot(() => {
      useClickOutside(contains(() => el), handler);
    });

    firePointerDown(el);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('respects enabled=false', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    createRoot(() => {
      useClickOutside(contains(() => el), handler, { enabled: () => false });
    });

    firePointerDown(document.body);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('cleans up on dispose', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    const dispose = createRoot((d) => {
      useClickOutside(contains(() => el), handler);
      return d;
    });

    dispose();
    firePointerDown(document.body);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(el);
  });

  // ─── New contract clauses ───────────────────────────────────────────────

  it('fires when predicate returns false (predicate is the surface)', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    createRoot(() => {
      useClickOutside(() => false, handler);
    });

    firePointerDown(el);
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(el);
  });

  it('does not fire when predicate returns true (predicate is the surface)', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    createRoot(() => {
      useClickOutside(() => true, handler);
    });

    firePointerDown(el);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('listens on pointerdown, not mousedown', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    createRoot(() => {
      useClickOutside(contains(() => el), handler);
    });

    // mousedown should NOT trigger — we listen on pointerdown only
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();

    // pointerdown SHOULD trigger
    firePointerDown(document.body);
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(el);
  });

  it('suppresses events whose timeStamp predates listener attachment', () => {
    const handler = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    createRoot(() => {
      useClickOutside(contains(() => el), handler);
    });

    // Forge an event with a timestamp before the hook attached.
    // performance.now() inside the hook is ≥ 0, so timeStamp = -1 is guaranteed earlier.
    const stale = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(stale, 'timeStamp', { value: -1, configurable: true });
    document.body.dispatchEvent(stale);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it('does not block stopPropagation children — uses capture phase', () => {
    const handler = vi.fn();
    const surface = document.createElement('div');
    const stopper = document.createElement('div');
    document.body.appendChild(surface);
    document.body.appendChild(stopper);

    // Child outside the surface that swallows pointerdown bubbling.
    stopper.addEventListener('pointerdown', (e) => e.stopPropagation());

    createRoot(() => {
      useClickOutside(contains(() => surface), handler);
    });

    firePointerDown(stopper);
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(surface);
    document.body.removeChild(stopper);
  });
});

describe('contains helper', () => {
  it('single-ref: returns true for descendants, false outside', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    const sibling = document.createElement('div');
    document.body.appendChild(parent);
    document.body.appendChild(sibling);

    const isInside = contains(() => parent);
    expect(isInside(parent)).toBe(true);
    expect(isInside(child)).toBe(true);
    expect(isInside(sibling)).toBe(false);

    document.body.removeChild(parent);
    document.body.removeChild(sibling);
  });

  it('multi-ref: returns true if target is inside any non-null ref', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const aChild = document.createElement('span');
    a.appendChild(aChild);
    const outside = document.createElement('div');
    document.body.append(a, b, outside);

    // Mix in a null entry — shouldn't crash, shouldn't false-positive.
    const isInside = contains(() => [a, null, b]);
    expect(isInside(a)).toBe(true);
    expect(isInside(aChild)).toBe(true);
    expect(isInside(b)).toBe(true);
    expect(isInside(outside)).toBe(false);

    document.body.removeChild(a);
    document.body.removeChild(b);
    document.body.removeChild(outside);
  });

  it('returns false when accessor returns null/undefined', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const isInsideUndef = contains(() => undefined);
    const isInsideNull = contains(() => null);
    const isInsideEmpty = contains(() => []);

    expect(isInsideUndef(target)).toBe(false);
    expect(isInsideNull(target)).toBe(false);
    expect(isInsideEmpty(target)).toBe(false);

    document.body.removeChild(target);
  });
});
