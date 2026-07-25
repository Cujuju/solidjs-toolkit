import { describe, expect, it, vi } from 'vitest';
import { createRoot, onCleanup } from 'solid-js';
import { trackedRef } from '../context';

/**
 * `trackedRef` is the contract that element registrations are undone.
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
describe('trackedRef', () => {
  it('registers the element, then unregisters it on disposal', () => {
    const register = vi.fn();
    const el = document.createElement('div');

    const dispose = createRoot((d) => {
      trackedRef<HTMLElement>(register)(el);
      return d;
    });

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(el);

    dispose();

    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenLastCalledWith(null);
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
      trackedRef<HTMLElement>((maybeEl) => {
        // Throws only on the cleanup call, the way a stale reactive read does.
        if (maybeEl === null) throw new TypeError("Cannot read properties of undefined (reading 'id')");
      })(el);
      onCleanup(laterCleanup);
      return d;
    });

    expect(() => dispose()).not.toThrow();
    expect(laterCleanup).toHaveBeenCalledTimes(1);

    // Contained, NOT silenced — the mistake still has to be findable.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toContain('trackedRef cleanup threw');
    consoleError.mockRestore();
  });

  it('scopes the cleanup to the owner that created the ref, not to an ancestor', () => {
    // What makes it correct inside a <For>: an item leaving the list must undo its
    // own registration while the list, and every sibling's registration, stands.
    const outer = vi.fn();
    const inner = vi.fn();
    let disposeInner!: () => void;

    const disposeOuter = createRoot((dOuter) => {
      trackedRef<HTMLElement>(outer)(document.createElement('div'));
      createRoot((dInner) => {
        trackedRef<HTMLElement>(inner)(document.createElement('div'));
        disposeInner = dInner;
      });
      return dOuter;
    });

    disposeInner();
    expect(inner).toHaveBeenLastCalledWith(null);
    expect(outer).toHaveBeenCalledTimes(1); // still registered

    disposeOuter();
    expect(outer).toHaveBeenLastCalledWith(null);
  });
});
