/**
 * Contract tests for the ONE Escape-owner stack: only the topmost open surface handles Escape,
 * across separately bundled copies of this module.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, createSignal, createComponent } from 'solid-js';
import {
  Portal,
  addEventListener as delegate,
  delegateEvents,
  insert,
  render,
} from 'solid-js/web';
import {
  createEscapeOwner,
  isEscapeDismissing,
  ESCAPE_OWNERS_KEY,
} from '../createEscapeOwner';

interface Registry {
  stack: unknown[];
  listener: ((e: Event) => void) | null;
  dismissing: number;
}
const registry = (): Registry =>
  (globalThis as unknown as Record<symbol, Registry>)[ESCAPE_OWNERS_KEY];

const escape = (): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};

const disposers: Array<() => void> = [];
function root<T>(fn: () => T): T {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return fn();
  });
}
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

describe('createEscapeOwner', () => {
  it('dismisses only the topmost entry and consumes the event', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    root(() => {
      createEscapeOwner({ open: () => true, onDismiss: lower });
      createEscapeOwner({ open: () => true, onDismiss: upper });
    });

    const bubbled = vi.fn();
    document.body.addEventListener('keydown', bubbled);
    const e = escape();
    document.body.removeEventListener('keydown', bubbled);

    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower, 'the surface underneath was dismissed too').not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    expect(bubbled, 'propagation was not stopped').not.toHaveBeenCalled();
  });

  it('ignores an Escape an EARLIER capture handler already claimed', () => {
    const onDismiss = vi.fn();
    // Registered before the stack's first entry, so it precedes the owner's own document
    // listener — see the residual on ordering in .audit/reports/escape-contract.md.
    const claim = (e: Event): void => e.preventDefault();
    document.addEventListener('keydown', claim, true);
    root(() => createEscapeOwner({ open: () => true, onDismiss }));
    escape();
    document.removeEventListener('keydown', claim, true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('lets a handler INSIDE the top surface keep its own Escape', () => {
    const onDismiss = vi.fn();
    const panel = document.createElement('div');
    const inner = document.createElement('input');
    panel.appendChild(inner);
    document.body.appendChild(panel);
    // The nested editor cancels its own edit and claims the key, exactly as an inline
    // "+ New item" input does inside a flyout.
    const innerHandler = vi.fn((e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    });
    inner.addEventListener('keydown', innerHandler);

    root(() => createEscapeOwner({ open: () => true, onDismiss, owns: () => [panel] }));
    inner.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(innerHandler).toHaveBeenCalledTimes(1);
    expect(onDismiss, 'the surface swallowed its own panel\'s Escape').not.toHaveBeenCalled();

    // Nothing inside claimed it: the surface dismisses on the way out instead.
    innerHandler.mockImplementation(() => {});
    inner.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
    panel.remove();
  });

  it('consumes an Escape raised OUTSIDE the panel before any ancestor sees it', () => {
    const onDismiss = vi.fn();
    const panel = document.createElement('div');
    const wrapper = document.createElement('div');
    const anchor = document.createElement('button');
    wrapper.appendChild(anchor);
    document.body.append(panel, wrapper);
    const ancestor = vi.fn();
    wrapper.addEventListener('keydown', ancestor);

    root(() => createEscapeOwner({ open: () => true, onDismiss, owns: () => [panel] }));
    anchor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(ancestor, 'an enclosing handler saw an Escape this surface consumed').not.toHaveBeenCalled();
    panel.remove();
    wrapper.remove();
  });

  it('ignores other keys', () => {
    const onDismiss = vi.fn();
    root(() => createEscapeOwner({ open: () => true, onDismiss }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('pushes and pops symmetrically, and drops the listener when empty', () => {
    const [open, setOpen] = createSignal(false);
    const onDismiss = vi.fn();
    const owner = root(() => createEscapeOwner({ open, onDismiss }));

    expect(registry().stack).toHaveLength(0);
    expect(registry().listener).toBeNull();

    setOpen(true);
    expect(registry().stack).toHaveLength(1);
    expect(registry().listener).not.toBeNull();
    expect(owner.isTop()).toBe(true);

    setOpen(false);
    expect(registry().stack).toHaveLength(0);
    expect(registry().listener, 'the document listener outlived the last entry').toBeNull();
    expect(owner.isTop()).toBe(false);

    // Re-open: the entry re-arms, and only once.
    setOpen(true);
    setOpen(true);
    expect(registry().stack).toHaveLength(1);
  });

  it('releases on unmount', () => {
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      createEscapeOwner({ open: () => true, onDismiss: () => {} });
    });
    expect(registry().stack).toHaveLength(1);
    dispose();
    expect(registry().stack).toHaveLength(0);
  });

  it('keeps a REFUSED dismissal on top: the key stays consumed and the next Escape asks again', () => {
    const lower = vi.fn();
    // A controlled parent that ignores the request: `open` stays true.
    const refuser = vi.fn();
    const owner = root(() => {
      createEscapeOwner({ open: () => true, onDismiss: lower });
      return createEscapeOwner({ open: () => true, onDismiss: refuser });
    });

    const first = escape();
    const second = escape();
    expect(refuser).toHaveBeenCalledTimes(2);
    expect(lower, 'the surface underneath closed while the one above stayed open').not.toHaveBeenCalled();
    expect(first.defaultPrevented && second.defaultPrevented).toBe(true);
    expect(owner.isTop(), 'a still-open surface lost ownership').toBe(true);
  });

  it('releases only on the open -> false edge', () => {
    const [open, setOpen] = createSignal(true);
    const onDismiss = vi.fn();
    root(() => createEscapeOwner({ open, onDismiss }));

    escape(); // refused — `open` is still true, so the entry stays
    expect(registry().stack).toHaveLength(1);

    setOpen(false);
    expect(registry().stack).toHaveLength(0);
    setOpen(true);
    escape();
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('keeps show order when the open accessor re-runs without changing value', () => {
    // A plain-function `open` that reads another signal re-runs the tracking effect.
    const [tick, setTick] = createSignal(0);
    const lower = vi.fn();
    const upper = vi.fn();
    root(() => {
      createEscapeOwner({ open: () => (tick(), true), onDismiss: lower });
      createEscapeOwner({ open: () => true, onDismiss: upper });
    });

    setTick(1);
    escape();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower, 'a re-run moved the lower entry to the top').not.toHaveBeenCalled();
  });

  it('dismisses a TRANSPARENT entry on top alone, and the surface below still reports isTop', () => {
    const lower = vi.fn();
    const [hintOpen, setHintOpen] = createSignal(true);
    const hint = vi.fn(() => setHintOpen(false));
    const menu = root(() => {
      const owner = createEscapeOwner({ open: () => true, onDismiss: lower });
      createEscapeOwner({ open: hintOpen, onDismiss: hint, transparent: true });
      return owner;
    });

    expect(menu.isTop(), 'a transparent entry above took keyboard ownership').toBe(true);
    const e = escape();
    expect(hint).toHaveBeenCalledTimes(1);
    expect(lower, 'the surface underneath was dismissed too').not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    expect(menu.isTop()).toBe(true);

    // A non-transparent entry above still takes ownership.
    root(() => createEscapeOwner({ open: () => true, onDismiss: () => {} }));
    expect(menu.isTop()).toBe(false);
  });

  it('marks the dismissal so focus-out logic can ignore the refocus it causes', () => {
    const seen: boolean[] = [];
    root(() =>
      createEscapeOwner({
        open: () => true,
        onDismiss: () => seen.push(isEscapeDismissing()),
      }),
    );
    expect(isEscapeDismissing()).toBe(false);
    escape();
    expect(seen).toEqual([true]);
    expect(isEscapeDismissing(), 'the mark outlived the dismissal').toBe(false);
  });
});

describe('Escape raised inside an owned node (Solid delegated handlers)', () => {
  const escapeAt = (el: Element): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };

  /** `<div onKeyDown={outer}><Portal>{panel > input}</Portal><input anchor/></div>`, as JSX compiles it. */
  function mountPortaled(outer: (e: Event) => void) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wrapper = document.createElement('div');
    const panel = document.createElement('div');
    const editor = document.createElement('input');
    const anchor = document.createElement('input');
    panel.appendChild(editor);
    // Compiled JSX registers Solid's document listener at module load, before any owner opens.
    delegateEvents(['keydown']);
    delegate(wrapper, 'keydown', outer, true);
    const dispose = render(() => {
      insert(wrapper, createComponent(Portal, { children: panel }), null);
      wrapper.appendChild(anchor);
      return wrapper;
    }, host);
    disposers.push(() => {
      dispose();
      host.remove();
    });
    return { panel, editor, anchor };
  }

  it('dismisses before an ENCLOSING delegated handler sees the key', () => {
    const outer = vi.fn((_e: Event) => {});
    const onDismiss = vi.fn();
    const { panel, editor } = mountPortaled(outer);
    root(() => createEscapeOwner({ open: () => true, onDismiss, owns: () => [panel] }));

    const e = escapeAt(editor);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    expect(outer, 'the enclosing handler also acted on a consumed Escape').not.toHaveBeenCalled();
  });

  it('gives a DELEGATED nested editor first refusal', () => {
    const outer = vi.fn((_e: Event) => {});
    const onDismiss = vi.fn();
    const { panel, editor } = mountPortaled(outer);
    const cancelEdit = vi.fn((e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    });
    delegate(editor, 'keydown', cancelEdit, true);
    root(() => createEscapeOwner({ open: () => true, onDismiss, owns: () => [panel] }));

    escapeAt(editor);
    expect(cancelEdit).toHaveBeenCalledTimes(1);
    expect(onDismiss, 'the surface swallowed its editor\'s Escape').not.toHaveBeenCalled();
  });

  it('lets an owned ANCHOR keep its own Escape, delegated or native', () => {
    const onDismiss = vi.fn();
    const { panel, anchor } = mountPortaled(() => {});
    const claim = vi.fn((e: Event) => e.preventDefault());
    root(() => createEscapeOwner({ open: () => true, onDismiss, owns: () => [panel, anchor] }));

    delegate(anchor, 'keydown', claim, true);
    escapeAt(anchor);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(onDismiss, 'a delegated anchor handler lost its Escape').not.toHaveBeenCalled();

    anchor.addEventListener('keydown', claim);
    escapeAt(anchor);
    expect(claim).toHaveBeenCalledTimes(3);
    expect(onDismiss, 'a native anchor handler lost its Escape').not.toHaveBeenCalled();

    // Unclaimed at the anchor: the surface dismisses.
    claim.mockImplementation(() => {});
    escapeAt(anchor);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('treats stopPropagation alone inside the panel as a claim, leaving the key unconsumed', () => {
    const onDismiss = vi.fn();
    const { panel, editor } = mountPortaled(() => {});
    editor.addEventListener('keydown', (e) => e.stopPropagation());
    root(() => createEscapeOwner({ open: () => true, onDismiss, owns: () => [panel] }));

    const e = escapeAt(editor);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('falls back to the document bubble when the slot is reassigned after acquire', () => {
    const [open, setOpen] = createSignal(true);
    const refuse = { on: true };
    const { panel, editor } = mountPortaled(() => {});
    root(() =>
      createEscapeOwner({
        open,
        onDismiss: () => !refuse.on && setOpen(false),
        owns: () => [panel],
      }),
    );

    escapeAt(editor); // refused, so the entry stays and its hook is installed
    // Spread props re-assign the delegated slot, overwriting the hook.
    const late = vi.fn();
    delegate(panel, 'keydown', late, true);
    refuse.on = false;

    const e = escapeAt(editor);
    expect(late).toHaveBeenCalledTimes(1);
    expect(open(), 'the lost hook left in-panel Escape dead').toBe(false);
    expect(e.defaultPrevented).toBe(true);
    expect((panel as unknown as Record<string, unknown>).$$keydown, 'release clobbered the new handler').toBe(late);
  });

  it('restores the owned node\'s own handler on release', () => {
    const [open, setOpen] = createSignal(true);
    const { panel, editor } = mountPortaled(() => {});
    const own = vi.fn();
    delegate(panel, 'keydown', own, true);
    root(() => createEscapeOwner({ open, onDismiss: () => setOpen(false), owns: () => [panel] }));

    escapeAt(editor);
    expect(open()).toBe(false);
    expect((panel as unknown as Record<string, unknown>).$$keydown).toBe(own);
  });
});

describe('two separately bundled copies of the module', () => {
  it('share one stack and one document listener', async () => {
    // Same Solid, a second copy of THIS module — exactly what bundling the primitive into two
    // dists produces. Without the mock, resetModules would also fork solid-js.
    const solid = await import('solid-js');
    vi.doMock('solid-js', () => solid);
    vi.resetModules();
    const copyB = (await import('../createEscapeOwner')) as typeof import('../createEscapeOwner');
    vi.doUnmock('solid-js');
    expect(copyB.createEscapeOwner, 'vi.resetModules returned the same module instance').not.toBe(
      createEscapeOwner,
    );

    const fromA = vi.fn();
    const fromB = vi.fn();
    root(() => createEscapeOwner({ open: () => true, onDismiss: fromA }));
    root(() => copyB.createEscapeOwner({ open: () => true, onDismiss: fromB }));

    expect(registry().stack, 'copy B kept its own stack').toHaveLength(2);

    escape();
    expect(fromB, 'copy B is on top and must be the only one dismissed').toHaveBeenCalledTimes(1);
    expect(fromA, 'one Escape dismissed a surface from each bundle').not.toHaveBeenCalled();

    // Copy B's entry refused, so it stays on top and is asked again.
    escape();
    expect(fromA).not.toHaveBeenCalled();
    expect(fromB).toHaveBeenCalledTimes(2);
  });
});
