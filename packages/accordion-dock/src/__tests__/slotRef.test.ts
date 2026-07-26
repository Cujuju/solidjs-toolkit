import { describe, expect, it, vi } from 'vitest';
import { createRoot, onCleanup } from 'solid-js';
import { createMapSlot, slotRef, type ElementSlot } from '../context';

/**
 * `slotRef` is the contract that element registrations are undone, and undone only
 * by whoever actually put them there.
 *
 * It exists because Solid calls a `ref` exactly once — on creation, never on
 * unmount — so the natural spelling registers an element and then holds it
 * forever, including after it has left the document. A detached node measures as a
 * zero-size rect at the origin and swallows `.focus()` without error, so the
 * symptoms surface far from the cause (a popover in the corner of the screen, a
 * keystroke that does nothing) with a clean console.
 *
 * These are unit tests rather than browser tests deliberately: the property under
 * test is "does the cleanup run, and does it stay contained", which needs an owner
 * and a disposal, not a layout engine.
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
     * THE second defect, and the reason `clear` is handed the element.
     *
     * When one element replaces another under the same key, the OUTGOING element's
     * cleanup can run AFTER the incoming one has registered — an unconditional
     * `delete(key)` then removes the live element and the key resolves to nothing.
     *
     * Observed, not imagined: a vertical→horizontal orientation swap did exactly
     * this. The rail button mounted and registered, the outgoing vertical header
     * unmounted and cleared, and the panel was left with no activator at all — so
     * `activatorElOf` returned undefined, the flyout had no anchor and the keyboard
     * had no target. The opposite direction interleaved the other way and worked,
     * which is how it stayed hidden.
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
     * THE regression test, and the reason the helper has a try/catch at all.
     *
     * Solid unwinds an owner by walking its cleanups; an exception in one
     * abandons the walk, so every cleanup registered after it is silently
     * skipped. The first version of this helper read an id off a `<Show>`-provided
     * prop during teardown and threw a TypeError — and the cleanups that never ran
     * as a result included the tear-off controller's, so navigating away from the
     * dock left its popped-out OS windows orphaned on screen. The failure was two
     * layers from the line that threw and reported itself as nothing at all.
     *
     * `laterCleanup` stands in for that controller: it is registered AFTER the
     * throwing ref, so it is exactly what a resumed walk reaches and an abandoned
     * one does not.
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
