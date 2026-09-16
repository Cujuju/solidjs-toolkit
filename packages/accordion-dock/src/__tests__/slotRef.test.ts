import { describe, expect, it, vi } from 'vitest';
import { createRoot, onCleanup } from 'solid-js';
import { createMapSlot, slotRef, type ElementSlot } from '../context';

/**
 * `slotRef` is the contract that element registrations are undone. Solid calls a `ref` once,
 * never on unmount. See DESIGN_NOTES.md § src/__tests__/slotRef.test.ts:5.
 */
describe('slotRef', () => {
  it('fills the slot, then empties it on disposal', () => {
    const set = vi.fn();
    const clear = vi.fn();
    const el = document.createElement('div');

    const dispose = createRoot((d) => {
      slotRef({ set, clear }, 'k')(el);
      return d;
    });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('k', el);
    expect(clear).not.toHaveBeenCalled();

    dispose();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith('k', el);
  });

  it('a Map slot forgets the element it was given', () => {
    const map = new Map<string, HTMLElement>();
    const el = document.createElement('div');
    const dispose = createRoot((d) => {
      slotRef(createMapSlot(map), 'k')(el);
      return d;
    });
    expect(map.get('k')).toBe(el);
    dispose();
    expect(map.has('k')).toBe(false);
  });

  it('does NOT delete a replacement that arrived first', () => {
    /*
         * THE defect behind `clear` taking the element: the outgoing cleanup can run AFTER the
         * incoming registration. See DESIGN_NOTES.md § src/__tests__/slotRef.test.ts:53.
         */
    const map = new Map<string, HTMLElement>();
    const slot = createMapSlot(map);
    const outgoing = document.createElement('div');
    const incoming = document.createElement('span');

    const disposeOutgoing = createRoot((d) => {
      slotRef(slot, 'panel')(outgoing);
      return d;
    });
    // The replacement registers BEFORE the old owner tears down.
    slot.set('panel', incoming);
    disposeOutgoing();

    expect(map.get('panel')).toBe(incoming);
  });

  it('does not abandon the rest of the teardown when a cleanup throws', () => {
    /*
         * THE regression test, and why the helper has a try/catch: one throwing cleanup silently
         * skips the rest. See DESIGN_NOTES.md § src/__tests__/slotRef.test.ts:84.
         */
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const laterCleanup = vi.fn();
    const el = document.createElement('div');

    const dispose = createRoot((d) => {
      const throwingSlot: ElementSlot = {
        set: () => {},
        // Throws on the CLEAR, the way a stale reactive read during teardown does.
        clear: () => {
          throw new TypeError("Cannot read properties of undefined (reading 'id')");
        },
      };
      slotRef(throwingSlot, 'k')(el);
      onCleanup(laterCleanup);
      return d;
    });

    expect(() => dispose()).not.toThrow();
    expect(laterCleanup).toHaveBeenCalledTimes(1);

    // Contained, NOT silenced — the mistake still has to be findable.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toContain('clear() threw during teardown');
    consoleError.mockRestore();
  });

  it('scopes the cleanup to the owner that created the ref, not to an ancestor', () => {
    // What makes it correct inside a <For>: an item leaving the list must undo its
    // own registration while the list, and every sibling's registration, stands.
    const map = new Map<string, HTMLElement>();
    const slot = createMapSlot(map);
    let disposeInner!: () => void;

    const disposeOuter = createRoot((dOuter) => {
      slotRef(slot, 'outer')(document.createElement('div'));
      createRoot((dInner) => {
        slotRef(slot, 'inner')(document.createElement('div'));
        disposeInner = dInner;
      });
      return dOuter;
    });

    disposeInner();
    expect(map.has('inner')).toBe(false);
    expect(map.has('outer')).toBe(true); // sibling untouched

    disposeOuter();
    expect(map.has('outer')).toBe(false);
  });
});
