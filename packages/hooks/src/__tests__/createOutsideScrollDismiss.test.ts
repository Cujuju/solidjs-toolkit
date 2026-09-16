import { describe, it, expect, vi } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { createOutsideScrollDismiss } from '../createOutsideScrollDismiss';

function flush(): Promise<void> {
  return Promise.resolve();
}

describe('createOutsideScrollDismiss', () => {
  it('dismisses when scroll target is outside the panel', async () => {
    const onDismiss = vi.fn();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    await createRoot(async (dispose) => {
      const [open] = createSignal(true);
      createOutsideScrollDismiss(open, () => panel, onDismiss);
      await flush();

      outside.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);

      dispose();
      panel.remove();
      outside.remove();
    });
  });

  it('does NOT dismiss when scroll target is inside the panel', async () => {
    const onDismiss = vi.fn();
    const panel = document.createElement('div');
    const child = document.createElement('div');
    panel.appendChild(child);
    document.body.appendChild(panel);

    await createRoot(async (dispose) => {
      const [open] = createSignal(true);
      createOutsideScrollDismiss(open, () => panel, onDismiss);
      await flush();

      child.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).not.toHaveBeenCalled();

      dispose();
      panel.remove();
    });
  });

  it('does not attach listener while closed', async () => {
    const onDismiss = vi.fn();
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    await createRoot(async (dispose) => {
      const [open] = createSignal(false);
      createOutsideScrollDismiss(open, () => null, onDismiss);
      await flush();

      outside.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).not.toHaveBeenCalled();

      dispose();
      outside.remove();
    });
  });

  it('detaches on close and reattaches on reopen', async () => {
    const onDismiss = vi.fn();
    const panel = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(panel);
    document.body.appendChild(outside);

    await createRoot(async (dispose) => {
      const [open, setOpen] = createSignal(true);
      createOutsideScrollDismiss(open, () => panel, onDismiss);
      await flush();

      outside.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);

      setOpen(false);
      await flush();
      outside.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);

      setOpen(true);
      await flush();
      outside.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(2);

      dispose();
      panel.remove();
      outside.remove();
    });
  });

  it('removes listener on owner dispose', async () => {
    const onDismiss = vi.fn();
    const panel = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(panel);
    document.body.appendChild(outside);

    const dispose = createRoot((d) => {
      const [open] = createSignal(true);
      createOutsideScrollDismiss(open, () => panel, onDismiss);
      return d;
    });

    await flush();
    outside.dispatchEvent(new Event('scroll', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    dispose();

    outside.dispatchEvent(new Event('scroll', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    panel.remove();
    outside.remove();
  });

  it('suppresses dismiss when shouldSuppress predicate returns true', async () => {
    // Portal'd descendant is a <body> sibling, so panel.contains is false; shouldSuppress must keep
    // the parent open while the descendant scrolls.
    const onDismiss = vi.fn();
    const panel = document.createElement('div');
    const descendant = document.createElement('div');
    descendant.setAttribute('data-flyout-descendant', 'true');
    document.body.appendChild(panel);
    document.body.appendChild(descendant);

    const shouldSuppress = (target: EventTarget | null): boolean => {
      const el = target as Element | null;
      return !!el?.closest?.('[data-flyout-descendant="true"]');
    };

    await createRoot(async (dispose) => {
      const [open] = createSignal(true);
      createOutsideScrollDismiss(open, () => panel, onDismiss, shouldSuppress);
      await flush();

      descendant.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).not.toHaveBeenCalled();

      // Sanity: a scroll outside both panel AND descendant still
      // dismisses, so the predicate isn't masking real desync.
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      outside.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);

      dispose();
      panel.remove();
      descendant.remove();
      outside.remove();
    });
  });

  it('does NOT dismiss when panel ref is undefined (mount race guard)', async () => {
    // Scroll-during-mount race: open() is true but the panel ref is still unset; a queued scroll
    // must not dismiss the just-opened panel.
    const onDismiss = vi.fn();
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    await createRoot(async (dispose) => {
      const [open] = createSignal(true);
      createOutsideScrollDismiss(open, () => null, onDismiss);
      await flush();

      outside.dispatchEvent(new Event('scroll', { bubbles: true }));
      expect(onDismiss).not.toHaveBeenCalled();

      dispose();
      outside.remove();
    });
  });
});
