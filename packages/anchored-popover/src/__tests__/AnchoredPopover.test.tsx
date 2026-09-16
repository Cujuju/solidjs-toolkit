import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import AnchoredPopover from '../AnchoredPopover';

// jsdom lacks the Popover API; per-test stubs count showPopover/hidePopover calls and
// control `:popover-open`.

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

  it('lets an anchor input keep its own Escape, and dismisses when it does not claim it', () => {
    const onDismiss = vi.fn();
    const [claims, setClaims] = createSignal(true);
    let input!: HTMLInputElement;
    dispose = render(
      () => (
        <>
          <input
            ref={input}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && claims()) e.preventDefault();
            }}
          />
          <AnchoredPopover open={() => true} anchor={() => input} onDismiss={onDismiss}>
            <div>content</div>
          </AnchoredPopover>
        </>
      ),
      document.body,
    );

    const press = (): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      input.dispatchEvent(e);
      return e;
    };
    press();
    expect(onDismiss, 'the combobox anchor lost its Escape').not.toHaveBeenCalled();

    setClaims(false);
    expect(press().defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on an unclaimed Escape raised inside the panel', () => {
    const onDismiss = vi.fn();
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={() => true} anchor={() => anchor} onDismiss={onDismiss}>
          <button class="inside">content</button>
        </AnchoredPopover>
      ),
      document.body,
    );

    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.querySelector('.inside')!.dispatchEvent(evt);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
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

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function makeOpenParent(): { parent: HTMLElement; parentHide: ReturnType<typeof vi.fn> } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const parentHide = vi.fn();
  Object.defineProperty(parent, 'hidePopover', { value: parentHide, configurable: true });
  Object.defineProperty(parent, 'showPopover', { value: vi.fn(), configurable: true });
  const originalParentMatches = parent.matches.bind(parent);
  parent.matches = (selector: string): boolean =>
    selector === ':popover-open' ? true : originalParentMatches(selector);
  return { parent, parentHide };
}

describe('onShown / parent re-promote fire once per open transition', () => {
  it('does not re-fire onShown or re-promote the parent when the anchor is replaced while open', async () => {
    const onShown = vi.fn();
    const [anchor, setAnchor] = createSignal<HTMLElement>(makeAnchor());
    const { parent, parentHide } = makeOpenParent();
    dispose = render(
      () => (
        <AnchoredPopover
          open={() => true}
          anchor={anchor}
          parentPopoverRef={() => parent}
          onShown={onShown}
          onDismiss={() => {}}
        >
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    await nextFrame();
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(parentHide).toHaveBeenCalledTimes(1);

    setAnchor(makeAnchor({ top: 300, bottom: 330 }));
    await nextFrame();

    expect(onShown).toHaveBeenCalledTimes(1);
    expect(parentHide).toHaveBeenCalledTimes(1);
    expect(findPopoverElement().style.top).toBe('334px');
  });

  it('still fires onShown when the anchor lands in the same frame as the open', async () => {
    const onShown = vi.fn();
    const [open, setOpen] = createSignal(false);
    const [anchor, setAnchor] = createSignal<HTMLElement | null>(null);
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={anchor} onShown={onShown} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    setOpen(true);
    setAnchor(makeAnchor());
    await nextFrame();

    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('fires onShown again on every reopen', async () => {
    const onShown = vi.fn();
    const [open, setOpen] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={open} anchor={() => anchor} onShown={onShown} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    await nextFrame();
    setOpen(false);
    setOpen(true);
    await nextFrame();

    expect(onShown).toHaveBeenCalledTimes(2);
  });

  it('does not fire onShown or re-promote when open flips back to false before the frame', async () => {
    const onShown = vi.fn();
    const [open, setOpen] = createSignal(false);
    const anchor = makeAnchor();
    const { parent, parentHide } = makeOpenParent();
    dispose = render(
      () => (
        <AnchoredPopover
          open={open}
          anchor={() => anchor}
          parentPopoverRef={() => parent}
          onShown={onShown}
          onDismiss={() => {}}
        >
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    setOpen(true);
    setOpen(false);
    await nextFrame();

    expect(onShown).not.toHaveBeenCalled();
    expect(parentHide).not.toHaveBeenCalled();
  });
});

describe('Escape dismisses only the topmost open popover', () => {
  function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  it('dismisses the most recently opened popover first, regardless of mount order', () => {
    const [parentOpen, setParentOpen] = createSignal(false);
    const [childOpen, setChildOpen] = createSignal(false);
    const parentDismiss = vi.fn(() => setParentOpen(false));
    const childDismiss = vi.fn(() => setChildOpen(false));
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <>
          <AnchoredPopover open={childOpen} anchor={() => anchor} onDismiss={childDismiss}>
            <div>child</div>
          </AnchoredPopover>
          <AnchoredPopover open={parentOpen} anchor={() => anchor} onDismiss={parentDismiss}>
            <div>parent</div>
          </AnchoredPopover>
        </>
      ),
      document.body,
    );

    setParentOpen(true);
    setChildOpen(true);

    pressEscape();
    expect(childDismiss).toHaveBeenCalledTimes(1);
    expect(parentDismiss).not.toHaveBeenCalled();

    pressEscape();
    expect(childDismiss).toHaveBeenCalledTimes(1);
    expect(parentDismiss).toHaveBeenCalledTimes(1);
  });

  it('drops a popover from the stack when it unmounts while open', () => {
    const lowerDismiss = vi.fn();
    const upperDismiss = vi.fn();
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={() => true} anchor={() => anchor} onDismiss={lowerDismiss}>
          <div>lower</div>
        </AnchoredPopover>
      ),
      document.body,
    );
    const host = document.createElement('div');
    document.body.appendChild(host);
    const disposeUpper = render(
      () => (
        <AnchoredPopover open={() => true} anchor={() => anchor} onDismiss={upperDismiss}>
          <div>upper</div>
        </AnchoredPopover>
      ),
      host,
    );

    disposeUpper();
    pressEscape();

    expect(upperDismiss).not.toHaveBeenCalled();
    expect(lowerDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('shellClass with multiple tokens', () => {
  it('applies and swaps a whitespace-separated shellClass', () => {
    const [shellClass, setShellClass] = createSignal<string | undefined>('menu-shell theme-dark');
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover
          open={() => false}
          anchor={() => anchor}
          shellClass={shellClass()}
          onDismiss={() => {}}
        >
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    const el = findPopoverElement();
    expect(el.classList.contains('menu-shell')).toBe(true);
    expect(el.classList.contains('theme-dark')).toBe(true);

    setShellClass('  other  ');
    expect(el.classList.contains('menu-shell')).toBe(false);
    expect(el.classList.contains('theme-dark')).toBe(false);
    expect(el.classList.contains('other')).toBe(true);
  });
});

describe('panel resize while open', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-clamps when the panel grows after it was positioned', async () => {
    const observerCallbacks: Array<(entries: ResizeObserverEntry[]) => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: (entries: ResizeObserverEntry[]) => void) {
          observerCallbacks.push(cb);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const anchor = makeAnchor({ top: 670, bottom: 700 });
    dispose = render(
      () => (
        <AnchoredPopover open={() => true} anchor={() => anchor} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    await nextFrame();
    const el = findPopoverElement();
    expect(el.style.top).toBe('704px');

    const grownHeight = 300;
    el.getBoundingClientRect = () =>
      ({ top: 704, left: 50, right: 250, bottom: 1004, width: 200, height: grownHeight, x: 50, y: 704, toJSON: () => ({}) }) as DOMRect;
    for (const cb of observerCallbacks) cb([{ target: el } as unknown as ResizeObserverEntry]);

    expect(el.style.top).toBe(`${768 - grownHeight - 8}px`);
  });
});

describe('UA [popover] inset override', () => {
  it('sets right/bottom to auto so only top/left constrain the shell', async () => {
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <AnchoredPopover open={() => true} anchor={() => anchor} onDismiss={() => {}}>
          <div>content</div>
        </AnchoredPopover>
      ),
      document.body,
    );

    const el = findPopoverElement();
    expect(el.style.right).toBe('auto');
    expect(el.style.bottom).toBe('auto');

    await nextFrame();
    expect(el.style.top).not.toBe('');
    expect(el.style.right).toBe('auto');
    expect(el.style.bottom).toBe('auto');
  });
});
