import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import AnchoredPopover from '../AnchoredPopover';

// jsdom does not implement the Popover API natively. Stub
// HTMLElement.prototype with instrumented versions per test so the
// primitive's sync-with-browser behavior can be observed through the
// seams: showPopover/hidePopover call counts + a controllable
// :popover-open matcher.

interface PopoverStub {
  showPopover: ReturnType<typeof vi.fn>;
  hidePopover: ReturnType<typeof vi.fn>;
  /** Toggle whether `element.matches(':popover-open')` returns true. */
  setOpen: (open: boolean) => void;
}

const originalMatches = HTMLElement.prototype.matches;

function installPopoverStubs(): PopoverStub {
  let popoverOpen = false;
  const showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpen = true;
  });
  const hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpen = false;
  });

  HTMLElement.prototype.matches = function (selectors: string): boolean {
    if (selectors === ':popover-open') return popoverOpen;
    return originalMatches.call(this, selectors);
  };

  (HTMLElement.prototype as HTMLElement & { showPopover: () => void }).showPopover = showPopover;
  (HTMLElement.prototype as HTMLElement & { hidePopover: () => void }).hidePopover = hidePopover;

  return {
    showPopover,
    hidePopover,
    setOpen(open) {
      popoverOpen = open;
    },
  };
}

function uninstallPopoverStubs(): void {
  HTMLElement.prototype.matches = originalMatches;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).showPopover;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).hidePopover;
}

function findPopoverElement(): HTMLElement {
  const el = document.querySelector('[popover]');
  if (!el) throw new Error('popover element not found in DOM');
  return el as HTMLElement;
}

function makeAnchor(rect: Partial<DOMRect> = {}): HTMLElement {
  const el = document.createElement('div');
  const full: DOMRect = {
    top: rect.top ?? 100,
    left: rect.left ?? 50,
    right: rect.right ?? 150,
    bottom: rect.bottom ?? 130,
    width: rect.width ?? 100,
    height: rect.height ?? 30,
    x: rect.left ?? 50,
    y: rect.top ?? 100,
    toJSON: () => ({}),
  };
  el.getBoundingClientRect = () => full;
  document.body.appendChild(el);
  return el;
}

let stubs: PopoverStub;
let dispose: (() => void) | null = null;

beforeEach(() => {
  stubs = installPopoverStubs();
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

afterEach(() => {
  dispose?.();
  dispose = null;
  uninstallPopoverStubs();
  document.body.innerHTML = '';
});

describe('AnchoredPopover', () => {
  it('uses popover="manual" mode (no UA light-dismiss racing trigger clicks)', () => {
    const [open] = createSignal(false);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    const el = findPopoverElement();
    expect(el.getAttribute('popover')).toBe('manual');
  });

  it('calls showPopover when open() flips false → true', () => {
    const [open, setOpen] = createSignal(false);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    expect(stubs.showPopover).not.toHaveBeenCalled();

    setOpen(true);

    expect(stubs.showPopover).toHaveBeenCalledTimes(1);
  });

  it('calls hidePopover when open() flips true → false', () => {
    const [open, setOpen] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    expect(stubs.showPopover).toHaveBeenCalledTimes(1);

    setOpen(false);

    expect(stubs.hidePopover).toHaveBeenCalledTimes(1);
  });

  it('skips redundant showPopover when the browser already reports open', () => {
    const [open, setOpen] = createSignal(false);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    stubs.setOpen(true);
    setOpen(true);

    expect(stubs.showPopover).not.toHaveBeenCalled();
  });

  it('fires onDismiss on outside pointerdown when open', () => {
    const onDismiss = vi.fn();
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    const outside = document.createElement('div');
    document.body.appendChild(outside);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onDismiss when pointerdown is on the anchor (toggle path)', () => {
    const onDismiss = vi.fn();
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does NOT fire onDismiss when pointerdown is inside the popover panel', () => {
    const onDismiss = vi.fn();
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
          <div data-inside>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    const inside = document.querySelector('[data-inside]') as HTMLElement;
    inside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does NOT fire onDismiss on outside pointerdown when closed', () => {
    const onDismiss = vi.fn();
    const [open] = createSignal(false);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    const outside = document.createElement('div');
    document.body.appendChild(outside);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('fires onDismiss on Escape when open', () => {
    const onDismiss = vi.fn();
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onDismiss on Escape when closed', () => {
    const onDismiss = vi.fn();
    const [open] = createSignal(false);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('honors event.defaultPrevented on Escape (lets internal handlers cancel dismiss)', () => {
    const onDismiss = vi.fn();
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    evt.preventDefault();
    document.dispatchEvent(evt);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('computes initial position below-start of anchor by default', async () => {
    const [open, setOpen] = createSignal(false);
    const anchor = makeAnchor({
      top: 100,
      left: 50,
      right: 150,
      bottom: 130,
      width: 100,
      height: 30,
    });
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    setOpen(true);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const el = findPopoverElement();
    // below-start: top = anchor.bottom + offset (4), left = anchor.left.
    expect(el.style.top).toBe('134px');
    expect(el.style.left).toBe('50px');
  });

  describe('shellClass reactive applier', () => {
    it('applies shellClass to the popover shell element on mount', () => {
      const [open] = createSignal(false);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            shellClass="my-shell"
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      const el = findPopoverElement();
      expect(el.classList.contains('my-shell')).toBe(true);
    });

    it('removes the previous shellClass when the prop changes', () => {
      const [shellClass, setShellClass] = createSignal<string | undefined>('first');
      const [open] = createSignal(false);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            shellClass={shellClass()}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      const el = findPopoverElement();
      expect(el.classList.contains('first')).toBe(true);

      setShellClass('second');
      expect(el.classList.contains('first')).toBe(false);
      expect(el.classList.contains('second')).toBe(true);

      setShellClass(undefined);
      expect(el.classList.contains('second')).toBe(false);
    });
  });

  describe('shellStyle reactive applier', () => {
    it('writes CSS vars from shellStyle accessor to the shell', () => {
      const [open] = createSignal(false);
      const anchor = makeAnchor();
      const shellStyle = () => ({
        '--my-var': '42px',
        '--other-var': 'red',
      });
      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            shellStyle={shellStyle}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      const el = findPopoverElement();
      expect(el.style.getPropertyValue('--my-var')).toBe('42px');
      expect(el.style.getPropertyValue('--other-var')).toBe('red');
    });

    it('removes a key from the shell when the consumer drops it', () => {
      const [keys, setKeys] = createSignal<Record<string, string>>({
        '--a': '1px',
        '--b': '2px',
      });
      const [open] = createSignal(false);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            shellStyle={keys}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      const el = findPopoverElement();
      expect(el.style.getPropertyValue('--a')).toBe('1px');
      expect(el.style.getPropertyValue('--b')).toBe('2px');

      setKeys({ '--a': '1px' });
      expect(el.style.getPropertyValue('--a')).toBe('1px');
      expect(el.style.getPropertyValue('--b')).toBe('');
    });
  });

  describe('side placements (right / left)', () => {
    function stubPanel(el: HTMLElement, width = 200, height = 100): void {
      el.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    }

    it('right-start anchors panel to anchor’s right edge with start (top) alignment', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor({ top: 100, bottom: 130, left: 50, right: 150, width: 100, height: 30 });
      dispose = render(
        () => (
          <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}} placement="right-start">
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );
      const el = findPopoverElement();
      stubPanel(el, 200, 100);

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(el.style.left).toBe('154px');
      expect(el.style.top).toBe('100px');
    });

    it('left-end anchors panel to anchor’s left edge with end (bottom) alignment', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor({ top: 100, bottom: 200, left: 500, right: 600, width: 100, height: 100 });
      dispose = render(
        () => (
          <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}} placement="left-end">
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );
      const el = findPopoverElement();
      stubPanel(el, 200, 100);

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(el.style.left).toBe('296px');
      expect(el.style.top).toBe('100px');
    });

    it('clamps right-start back into viewport when popover would overflow bottom', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor({ top: 700, bottom: 730, left: 800, right: 900, width: 100, height: 30 });
      dispose = render(
        () => (
          <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}} placement="right-start">
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );
      const el = findPopoverElement();
      stubPanel(el, 100, 200);

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(el.style.top).toBe('560px');
    });

    it('ignores `centered` when placement is horizontal (side anchor stays authoritative)', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor({ top: 100, bottom: 130, left: 50, right: 150, width: 100, height: 30 });
      dispose = render(
        () => (
          <AnchoredPopover open={open} anchor={() => anchor} onDismiss={() => {}} placement="right-start" centered>
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );
      const el = findPopoverElement();
      stubPanel(el, 200, 100);

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(el.style.left).toBe('154px');
    });
  });

  describe('centered placement', () => {
    it('horizontally centers the panel in the viewport when centered=true', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor({ top: 100, bottom: 130, left: 50, right: 150, width: 100, height: 30 });
      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            centered
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      const el = findPopoverElement();
      el.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      // Centered: left = round((1024 - 200) / 2) = 412.
      expect(el.style.left).toBe('412px');
    });
  });

  describe('shouldSuppressDismiss predicate', () => {
    it('does NOT dismiss when predicate returns true for click target', () => {
      const onDismiss = vi.fn();
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      // Predicate accepting anything inside a `data-popover-stack` ancestor.
      const shouldSuppressDismiss = (t: Element): boolean =>
        !!t.closest('[data-popover-stack]');

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            onDismiss={onDismiss}
            shouldSuppressDismiss={shouldSuppressDismiss}
          >
            <div>my content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      // Simulate a Portal'd submenu marked with the convention.
      const submenu = document.createElement('div');
      submenu.setAttribute('data-popover-stack', '');
      document.body.appendChild(submenu);

      const inSubmenu = document.createElement('button');
      submenu.appendChild(inSubmenu);

      inSubmenu.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('DOES dismiss when predicate returns false for click target', () => {
      const onDismiss = vi.fn();
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const shouldSuppressDismiss = (t: Element): boolean =>
        !!t.closest('[data-popover-stack]');

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            onDismiss={onDismiss}
            shouldSuppressDismiss={shouldSuppressDismiss}
          >
            <div>my content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      // Outside any opted-in surface.
      const outside = document.createElement('button');
      document.body.appendChild(outside);

      outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses normally when no predicate is provided', () => {
      const onDismiss = vi.fn();
      const [open] = createSignal(true);
      const anchor = makeAnchor();

      dispose = render(
        () => (
          <AnchoredPopover open={open} anchor={() => anchor} onDismiss={onDismiss}>
            <div>my content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      const outside = document.createElement('div');
      document.body.appendChild(outside);

      outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('split anchor (horizontalAnchor)', () => {
    function stubPanel(el: HTMLElement, width = 200, height = 100): void {
      el.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    }

    it('reads x from horizontalAnchor and y from anchor on right-start (parent/child pattern)', async () => {
      const [open, setOpen] = createSignal(false);
      const triggerRow = makeAnchor({ top: 200, bottom: 230, left: 60, right: 220, width: 160, height: 30 });
      const parentPanel = makeAnchor({ top: 100, bottom: 500, left: 50, right: 280, width: 230, height: 400 });

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => triggerRow}
            horizontalAnchor={() => parentPanel}
            onDismiss={() => {}}
            placement="right-start"
            offsetPx={-3}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );
      const el = findPopoverElement();
      stubPanel(el, 380, 200);

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      // x: parentPanel.right(280) + offset(-3) = 277.
      // y: triggerRow.top(200).
      expect(el.style.left).toBe('277px');
      expect(el.style.top).toBe('200px');
    });

    it('falls back to anchor for x when horizontalAnchor returns null', async () => {
      const [open, setOpen] = createSignal(false);
      const trigger = makeAnchor({ top: 100, bottom: 130, left: 50, right: 150, width: 100, height: 30 });

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => trigger}
            horizontalAnchor={() => null}
            onDismiss={() => {}}
            placement="right-start"
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );
      const el = findPopoverElement();
      stubPanel(el, 200, 100);

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(el.style.left).toBe('154px');
    });

    it('does NOT fire onDismiss when click target is inside horizontalAnchor', () => {
      const onDismiss = vi.fn();
      const [open] = createSignal(true);
      const triggerRow = makeAnchor();
      const parentPanel = document.createElement('div');
      document.body.appendChild(parentPanel);
      const inParent = document.createElement('button');
      parentPanel.appendChild(inParent);

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => triggerRow}
            horizontalAnchor={() => parentPanel}
            onDismiss={onDismiss}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      inParent.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('parent re-promote (parentPopoverRef)', () => {
    it('calls parent.hidePopover()+showPopover() after our showPopover when parent is :popover-open', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor();

      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const parentHide = vi.fn();
      const parentShow = vi.fn();
      Object.defineProperty(parent, 'hidePopover', { value: parentHide, configurable: true });
      Object.defineProperty(parent, 'showPopover', { value: parentShow, configurable: true });
      const originalParentMatches = parent.matches.bind(parent);
      parent.matches = (selector: string): boolean =>
        selector === ':popover-open' ? true : originalParentMatches(selector);

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            parentPopoverRef={() => parent}
            onDismiss={() => {}}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(parentHide).toHaveBeenCalledTimes(1);
      expect(parentShow).toHaveBeenCalledTimes(1);
      const hideOrder = parentHide.mock.invocationCallOrder[0];
      const showOrder = parentShow.mock.invocationCallOrder[0];
      expect(hideOrder).toBeLessThan(showOrder);
    });

    it('skips parent re-promote silently when parent is NOT :popover-open', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor();

      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const parentHide = vi.fn();
      const parentShow = vi.fn();
      Object.defineProperty(parent, 'hidePopover', { value: parentHide, configurable: true });
      Object.defineProperty(parent, 'showPopover', { value: parentShow, configurable: true });
      const originalParentMatches = parent.matches.bind(parent);
      parent.matches = (selector: string): boolean =>
        selector === ':popover-open' ? false : originalParentMatches(selector);

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            parentPopoverRef={() => parent}
            onDismiss={() => {}}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(parentHide).not.toHaveBeenCalled();
      expect(parentShow).not.toHaveBeenCalled();
    });

    it('skips parent re-promote when parentPopoverRef returns null', async () => {
      const [open, setOpen] = createSignal(false);
      const anchor = makeAnchor();

      dispose = render(
        () => (
          <AnchoredPopover
            open={open}
            anchor={() => anchor}
            parentPopoverRef={() => null}
            onDismiss={() => {}}
          >
            <div>content</div>
          </AnchoredPopover>
        ),
        document.body,
      );

      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(stubs.showPopover).toHaveBeenCalledTimes(1);
    });
  });
});
