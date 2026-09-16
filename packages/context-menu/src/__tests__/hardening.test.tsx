import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal, Show } from 'solid-js';
import { ContextMenu } from '../ContextMenu';
import { submenuCloseDelayMs, type ContextMenuSurface } from '../MenuEntries';
import { POPOVER_PARENT_UNDER_OVERLAP_PX } from '../submenuPosition';
import type { ContextMenuEntry } from '../types';

// Per-element Popover API stub. `topLayer` records top-layer order the way
// the browser does: LIFO of showPopover() calls, last entry paints on top.
const topLayer: HTMLElement[] = [];
const originalMatches = HTMLElement.prototype.matches;
type PopoverProto = HTMLElement & { showPopover: () => void; hidePopover: () => void };

function installPopoverStubs(): void {
  HTMLElement.prototype.matches = function (selectors: string): boolean {
    if (selectors === ':popover-open') return topLayer.includes(this);
    return originalMatches.call(this, selectors);
  };
  const proto = HTMLElement.prototype as PopoverProto;
  proto.showPopover = function () {
    if (topLayer.includes(this)) throw new DOMException('already open', 'InvalidStateError');
    topLayer.push(this);
  };
  proto.hidePopover = function () {
    const i = topLayer.indexOf(this);
    if (i >= 0) topLayer.splice(i, 1);
  };
}

function uninstallPopoverStubs(): void {
  HTMLElement.prototype.matches = originalMatches;
  delete (HTMLElement.prototype as Partial<PopoverProto>).showPopover;
  delete (HTMLElement.prototype as Partial<PopoverProto>).hidePopover;
  topLayer.length = 0;
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let dispose: (() => void) | null = null;

function renderMenu(items: ContextMenuEntry[], surface?: ContextMenuSurface): void {
  dispose = render(
    () => <ContextMenu x={10} y={10} onClose={() => {}} items={items} surface={surface} />,
    document.body,
  );
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const rootMenu = () =>
  document.querySelector('.cujuju-context-menu:not(.cujuju-context-menu-flyout)') as HTMLElement;
const flyouts = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.cujuju-context-menu-flyout'));
const hover = (el: Element) => el.dispatchEvent(new MouseEvent('mouseenter'));
const wrappers = (scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll('.cujuju-context-menu-submenu-wrapper'));

beforeEach(() => {
  installPopoverStubs();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

afterEach(() => {
  dispose?.();
  dispose = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  uninstallPopoverStubs();
  document.body.innerHTML = '';
});

describe('ContextMenu — slider', () => {
  it('passes a fractional value through when step < 1', () => {
    const onChange = vi.fn();
    renderMenu([
      { slider: true, label: 'Opacity', min: 0, max: 1, step: 0.1, value: () => 0, onChange },
    ]);

    const input = document.querySelector('.cujuju-context-menu-slider') as HTMLInputElement;
    input.value = '0.7';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith(0.7);
  });
});

describe('ContextMenu — scrollable submenu search', () => {
  it('filters children whose label is JSX by their rendered text', () => {
    renderMenu([
      {
        submenu: true,
        scrollable: true,
        label: 'Series',
        children: [
          { label: <span>AAPL</span>, onClick: () => {} },
          { label: 'MSFT', onClick: () => {} },
        ],
      },
    ]);

    hover(wrappers()[0]);
    const search = document.querySelector('.cujuju-context-menu-flyout-search input') as HTMLInputElement;
    search.value = 'aa';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const labels = Array.from(flyouts()[0].querySelectorAll('.cujuju-context-menu-label')).map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(['AAPL']);
  });

  it('matches number labels and accessor labels (<Show>) by their rendered text', () => {
    dispose = render(() => {
      const items: ContextMenuEntry[] = [
        {
          submenu: true,
          scrollable: true,
          label: 'Series',
          children: [
            { label: 42, onClick: () => {} },
            { label: <Show when={true}>AAPL</Show>, onClick: () => {} },
            { label: 'MSFT', onClick: () => {} },
          ],
        },
      ];
      return <ContextMenu x={10} y={10} onClose={() => {}} items={items} />;
    }, document.body);

    hover(wrappers()[0]);
    const search = document.querySelector('.cujuju-context-menu-flyout-search input') as HTMLInputElement;
    const query = (q: string) => {
      search.value = q;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      return Array.from(flyouts()[0].querySelectorAll('.cujuju-context-menu-label')).map(
        (l) => l.textContent,
      );
    };

    expect(query('42')).toEqual(['42']);
    expect(query('aap')).toEqual(['AAPL']);
  });
});

describe('ContextMenu — root positioning', () => {
  it('re-anchors when x/y change without a remount', async () => {
    const [at, setAt] = createSignal({ x: 100, y: 100 });
    dispose = render(
      () => (
        <ContextMenu
          x={at().x}
          y={at().y}
          onClose={() => {}}
          items={[{ label: 'Item', onClick: () => {} }]}
        />
      ),
      document.body,
    );
    await nextFrame();
    expect(rootMenu().style.left).toBe('100px');

    setAt({ x: 700, y: 500 });
    await nextFrame();

    expect(rootMenu().style.left).toBe('700px');
    expect(rootMenu().style.top).toBe('500px');
  });

  it('caps the root menu height so a menu taller than the viewport scrolls', () => {
    renderMenu([{ label: 'Item', onClick: () => {} }]);

    expect(rootMenu().style.maxHeight).not.toBe('');
  });
});

describe('ContextMenu — checked state a11y', () => {
  it('exposes `checked` to assistive tech via aria-pressed', () => {
    renderMenu([
      { label: 'On', onClick: () => {}, checked: true },
      { label: 'Off', onClick: () => {}, checked: false },
      { label: 'Plain', onClick: () => {} },
    ]);

    const items = document.querySelectorAll('.cujuju-context-menu-item');
    expect(items[0].getAttribute('aria-pressed')).toBe('true');
    expect(items[1].getAttribute('aria-pressed')).toBe('false');
    expect(items[2].hasAttribute('aria-pressed')).toBe(false);
  });
});

describe('ContextMenu — submenu hover intent', () => {
  const items = (): ContextMenuEntry[] => [
    { submenu: true, label: 'Export', children: [{ label: 'CSV', onClick: () => {} }] },
    { label: 'Delete', onClick: () => {} },
  ];
  const deleteRow = () =>
    Array.from(rootMenu().querySelectorAll('.cujuju-context-menu-item')).find(
      (el) => el.textContent === 'Delete',
    ) as HTMLElement;
  // jsdom has no layout; the grace is derived from the parent menu's measured width.
  const DEFAULT_MENU_W = 160;
  let menuWidth = DEFAULT_MENU_W;
  const delay = () => submenuCloseDelayMs(menuWidth);

  beforeEach(() => {
    menuWidth = DEFAULT_MENU_W;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('cujuju-context-menu') ? menuWidth : 0;
    });
  });

  it('scales the grace to the parent menu\'s measured width', async () => {
    menuWidth = 300;
    renderMenu(items());
    hover(wrappers()[0]);
    await nextFrame();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    deleteRow().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(delay() - 1);
    expect(flyouts()).toHaveLength(1);
    vi.advanceTimersByTime(1);

    expect(flyouts()).toHaveLength(0);
  });

  it('does not arm the grace when the parent has no measurable width', async () => {
    // A 0 measurement (unlaid-out parent) must not mean a 0 ms grace.
    menuWidth = 0;
    renderMenu(items());
    hover(wrappers()[0]);
    await nextFrame();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    deleteRow().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(submenuCloseDelayMs(DEFAULT_MENU_W));

    expect(flyouts()).toHaveLength(1);
  });

  it('closes an open submenu once the pointer moves elsewhere in the parent menu', async () => {
    renderMenu(items());
    hover(wrappers()[0]);
    await nextFrame();
    expect(flyouts()).toHaveLength(1);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    deleteRow().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(delay());

    expect(flyouts()).toHaveLength(0);
  });

  it('keeps the submenu open when the pointer crosses a sibling on its way into the flyout', async () => {
    renderMenu(items());
    hover(wrappers()[0]);
    await nextFrame();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    deleteRow().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(delay() - 1);
    hover(flyouts()[0]);
    vi.advanceTimersByTime(delay());

    expect(flyouts()).toHaveLength(1);
  });

  it('keeps the submenu open when the pointer returns to its trigger within the grace', async () => {
    renderMenu(items());
    hover(wrappers()[0]);
    await nextFrame();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    deleteRow().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(delay() - 1);
    (wrappers()[0].firstElementChild as HTMLElement).dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true }),
    );
    vi.advanceTimersByTime(delay());

    expect(flyouts()).toHaveLength(1);
  });

  it('closes an open submenu when its parent menu scrolls (the flyout would detach)', async () => {
    renderMenu(items());
    hover(wrappers()[0]);
    await nextFrame();

    const scroller = rootMenu().querySelector('.cujuju-glass-menu-body') as HTMLElement;
    scroller.dispatchEvent(new Event('scroll'));

    expect(flyouts()).toHaveLength(0);
  });

  it('closes an open submenu when the menu moves to a new open point', async () => {
    const entries = items();
    const [at, setAt] = createSignal({ x: 100, y: 100 });
    dispose = render(
      () => <ContextMenu x={at().x} y={at().y} onClose={() => {}} items={entries} />,
      document.body,
    );
    hover(wrappers()[0]);
    await nextFrame();
    expect(flyouts()).toHaveLength(1);

    setAt({ x: 700, y: 500 });

    expect(flyouts()).toHaveLength(0);
  });
});

describe('ContextMenu — submenu top layer', () => {
  // Solid only: GlassMenu's `display: flex` already overrides the closed-[popover] display:none.
  it('measures the solid flyout after showing it, so the first flip uses its real size', async () => {
    const FLYOUT_W = 220;
    const PARENT = { left: 800, right: 1000 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const base = { x: 0, y: 0, top: 10, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
      if (this.classList.contains('cujuju-context-menu-flyout')) {
        // A closed [popover] is display:none — zero-sized until shown.
        const open = topLayer.includes(this);
        return { ...base, width: open ? FLYOUT_W : 0, height: open ? 100 : 0 } as DOMRect;
      }
      if (this.classList.contains('cujuju-context-menu')) {
        return { ...base, ...PARENT, width: PARENT.right - PARENT.left } as DOMRect;
      }
      return { ...base } as DOMRect;
    });

    renderMenu(
      [{ submenu: true, label: 'Export', children: [{ label: 'CSV', onClick: () => {} }] }],
      'solid',
    );
    hover(wrappers()[0]);
    await nextFrame();

    expect(flyouts()[0].style.left).toBe(
      `${PARENT.left - FLYOUT_W + POPOVER_PARENT_UNDER_OVERLAP_PX}px`,
    );
  });

  it('a submenu closed before its frame fires does not promote its detached flyout', async () => {
    renderMenu([
      { submenu: true, label: 'A', children: [{ label: 'a', onClick: () => {} }] },
      { submenu: true, label: 'B', children: [{ label: 'b', onClick: () => {} }] },
    ]);
    hover(wrappers()[0]);
    hover(wrappers()[1]);
    await nextFrame();

    expect(topLayer.every((el) => el.isConnected)).toBe(true);
  });

  it('keeps every ancestor above its child when submenus nest two levels', async () => {
    renderMenu([
      {
        submenu: true,
        label: 'A',
        children: [{ submenu: true, label: 'B', children: [{ label: 'Leaf', onClick: () => {} }] }],
      },
    ]);
    hover(wrappers()[0]);
    await nextFrame();
    const flyoutA = flyouts()[0];
    hover(wrappers(flyoutA)[0]);
    await nextFrame();
    const flyoutB = flyouts().find((f) => f !== flyoutA) as HTMLElement;

    expect(topLayer.indexOf(flyoutB)).toBeLessThan(topLayer.indexOf(flyoutA));
    expect(topLayer.indexOf(flyoutA)).toBeLessThan(topLayer.indexOf(rootMenu()));
  });
});
