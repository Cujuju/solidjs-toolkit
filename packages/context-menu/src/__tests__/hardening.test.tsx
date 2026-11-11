/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createRoot, createSignal, Show } from 'solid-js';
import { createEscapeOwner } from '@cujuju/solidjs-hooks';
import { ContextMenu } from '../ContextMenu.js';
import { ContextMenuSubmenuTrigger } from '../index.js';
import { submenuCloseDelayMs, type ContextMenuSurface } from '../MenuEntries.js';
import { POPOVER_PARENT_UNDER_OVERLAP_PX } from '../submenuPosition.js';
import submenuItemSource from '../SubmenuItem.tsx?raw';
import type { ContextMenuEntry, ContextMenuSubmenu } from '../types.js';

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

function renderMenu(items: ContextMenuEntry[], surface?: ContextMenuSurface, onClose = () => {}): void {
  dispose = render(
    () => <ContextMenu x={10} y={10} onClose={onClose} items={items} surface={surface} />,
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

  it('keyboard activation cancels the hover close of an open flyout', async () => {
    renderMenu(items());
    hover(wrappers()[0]);
    await nextFrame();
    const trigger = wrappers()[0].querySelector('button')!;
    const leaf = flyouts()[0].querySelector('button')!;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    deleteRow().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(delay());

    expect(flyouts()).toHaveLength(1);
    expect(document.activeElement).toBe(leaf);
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

describe('ContextMenu — shared Escape stack', () => {
  it('Escape closes the menu alone when it opened over another Escape owner', () => {
    const below = vi.fn();
    const disposeBelow = createRoot((d) => {
      createEscapeOwner({ open: () => true, onDismiss: below });
      return d;
    });
    const onClose = vi.fn();
    dispose = render(() => <ContextMenu x={10} y={10} onClose={onClose} items={[{ label: 'A', onClick: () => {} }]} />, document.body);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();
    disposeBelow();
  });
});

describe('ContextMenu — submenu keyboard path', () => {
  const items: ContextMenuEntry[] = [
    { submenu: true, label: 'More', children: [{ label: 'Child', onClick: () => {} }] },
  ];
  const trigger = () => document.querySelector<HTMLButtonElement>('.cujuju-context-menu-item-has-submenu')!;

  it('the trigger is a focusable button announcing its menu', () => {
    renderMenu(items);
    expect(trigger().tagName).toBe('BUTTON');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('a keyboard click (Enter/Space) opens the submenu and focuses its first row', async () => {
    renderMenu(items);
    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true })); // detail 0: keyboard-synthesised
    await nextFrame();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toContain('Child');
  });

  it('ArrowRight opens it; ArrowLeft closes it and returns focus to the trigger', async () => {
    renderMenu(items);
    trigger().focus();
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextFrame();
    expect(flyouts()).toHaveLength(1);
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(flyouts()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it('Escape from a focused built-in flyout dismisses the whole menu', async () => {
    const onClose = vi.fn();
    renderMenu(items, undefined, onClose);
    trigger().click();
    await nextFrame();
    const leaf = flyouts()[0].querySelector('button')!;
    expect(document.activeElement).toBe(leaf);

    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(leaf);
  });

  it('a detached flyout retains no hook from the root Escape owner', async () => {
    renderMenu(items);
    trigger().click();
    await nextFrame();
    const flyout = flyouts()[0];
    const leaf = flyout.querySelector('button')!;
    // Escape ownership wraps Solid's delegated keydown handler on an owned node.
    const keydown = Reflect.get(flyout, '$$keydown');
    leaf.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.stopPropagation(); });
    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(flyout.isConnected).toBe(false);
    expect(rootMenu()).not.toBeNull();
    expect(Reflect.get(flyout, '$$keydown')).toBe(keydown);
  });

  it('an open submenu disconnects its ResizeObserver when the menu unmounts', async () => {
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class extends ResizeObserverStub {
      disconnect(): void {
        disconnect();
      }
    });
    renderMenu(items);
    hover(wrappers()[0]!);
    await nextFrame();
    disconnect.mockClear();
    dispose!();
    dispose = null;
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('ContextMenu — slider name', () => {
  it('labels the range input with its visible label', () => {
    renderMenu([{ slider: true, label: 'Opacity', min: 0, max: 100, value: () => 50, onChange: () => {} }]);
    const input = document.querySelector<HTMLInputElement>('input[type="range"]')!;
    const labelId = input.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent).toBe('Opacity');
  });
});

describe('ContextMenuSubmenuTrigger', () => {
  const onLeaf = vi.fn();
  const submenu: ContextMenuSubmenu = {
    submenu: true, label: 'Export', children: [{ label: 'CSV', onClick: onLeaf }],
  };
  const customRow = (disabled = false, entry = submenu): ContextMenuEntry => ({
    custom: () => (
      <div class="custom-cells">
        <button type="button" class="cujuju-context-menu-item">Copy</button>
        <ContextMenuSubmenuTrigger submenu={entry} disabled={disabled} class="export-cell">
          <span>Export formats</span>
        </ContextMenuSubmenuTrigger>
      </div>
    ),
  });
  const trigger = () => document.querySelector<HTMLButtonElement>('button.export-cell')!;

  it('opens on hover from a cell and closes the menu when a flyout leaf is clicked', async () => {
    const onClose = vi.fn();
    const [open, setOpen] = createSignal(true);
    dispose = render(() => (
      <Show when={open()}>
        <ContextMenu x={10} y={10} items={[customRow()]} onClose={() => { onClose(); setOpen(false); }} />
      </Show>
    ), document.body);
    expect(trigger().parentElement?.className).toBe('custom-cells');
    expect(trigger().classList.contains('cujuju-context-menu-item')).toBe(true);
    hover(trigger());
    await nextFrame();
    const leaf = flyouts()[0]!.querySelector('button')!;
    expect(leaf.textContent).toBe('CSV');
    leaf.click();
    expect(onLeaf).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(rootMenu()).toBeNull();
    expect(flyouts()).toHaveLength(0);
  });

  it('does not click the enclosing custom row when the trigger is activated', async () => {
    const onRow = vi.fn();
    renderMenu([{
      custom: () => (
        <div onClick={onRow}>
          <ContextMenuSubmenuTrigger submenu={submenu} class="export-cell"><span>Export formats</span></ContextMenuSubmenuTrigger>
        </div>
      ),
    }]);
    trigger().click();
    await nextFrame();
    expect(onRow).not.toHaveBeenCalled();
    expect(flyouts()).toHaveLength(1);
  });

  it('a removed trigger cannot close a live sibling flyout', async () => {
    const builtin: ContextMenuEntry = { submenu: true, label: 'Live', children: [{ label: 'Leaf', onClick: () => {} }] };
    const [items, setItems] = createSignal<ContextMenuEntry[]>([customRow(), builtin]);
    dispose = render(() => <ContextMenu x={10} y={10} items={items()} onClose={() => {}} />, document.body);
    const stale = trigger();
    setItems([builtin]);
    const live = document.querySelector<HTMLButtonElement>('.cujuju-context-menu-item-has-submenu')!;
    live.click();
    await nextFrame();
    expect(flyouts()).toHaveLength(1);
    stale.click();
    await nextFrame();
    expect(flyouts()).toHaveLength(1);
  });

  it('does not reach a native click listener on the enclosing row', async () => {
    const onRow = vi.fn();
    renderMenu([{
      custom: () => (
        <div ref={(el) => el.addEventListener('click', onRow)}>
          <ContextMenuSubmenuTrigger submenu={submenu} class="export-cell"><span>Export formats</span></ContextMenuSubmenuTrigger>
        </div>
      ),
    }]);
    trigger().click();
    await nextFrame();
    expect(onRow).not.toHaveBeenCalled();
    expect(flyouts()).toHaveLength(1);
  });

  it('focuses the flyout on Enter activation and dismisses the whole menu on Escape', async () => {
    const onClose = vi.fn();
    renderMenu([customRow()], undefined, onClose);
    trigger().focus();
    trigger().click(); // jsdom does not synthesize the detail=0 click from Enter.
    await nextFrame();
    const leaf = flyouts()[0]!.querySelector('button')!;
    expect(document.activeElement).toBe(leaf);
    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(leaf);
  });

  it('runs a keepOpen leaf action without clicking the enclosing custom row', async () => {
    const onRowClick = vi.fn();
    const onLeafClick = vi.fn();
    const onClose = vi.fn();
    const entry = { ...submenu, children: [{ label: 'CSV', onClick: onLeafClick, keepOpen: true }] };
    renderMenu([{
      custom: () => (
        <div onClick={onRowClick}>
          <ContextMenuSubmenuTrigger submenu={entry}>Export formats</ContextMenuSubmenuTrigger>
        </div>
      ),
    }], undefined, onClose);
    hover(rootMenu().querySelector('button')!);
    await nextFrame();
    flyouts()[0].querySelector('button')!.click();

    expect(onLeafClick).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(flyouts()).toHaveLength(1);
  });

  it('documents that the custom trigger ignores submenu label and icon', () => {
    const doc = /\/\*\*([^*]*)\*\/\s*submenu: ContextMenuSubmenu/.exec(submenuItemSource)?.[1];
    expect(doc).toContain('label and icon are not rendered or searched');
  });

  it('shares the active submenu with built-in rows in both directions', async () => {
    renderMenu([customRow(), {
      submenu: true, label: 'Built-in', children: [{ label: 'Built-in leaf', onClick: () => {} }],
    }]);
    hover(wrappers()[0]!);
    await nextFrame();
    expect(flyouts().map((el) => el.textContent)).toEqual(['Built-in leaf']);
    hover(trigger());
    await nextFrame();
    expect(flyouts().map((el) => el.textContent)).toEqual(['CSV']);
    hover(wrappers()[0]!);
    await nextFrame();
    expect(flyouts().map((el) => el.textContent)).toEqual(['Built-in leaf']);
  });

  it('works in a nested custom row and focuses its searchable flyout', async () => {
    const onClose = vi.fn();
    renderMenu([{
      submenu: true, label: 'Outer', children: [customRow(false, { ...submenu, scrollable: true })],
    }], 'solid', onClose);
    hover(wrappers()[0]!);
    await nextFrame();
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextFrame();
    expect(flyouts()).toHaveLength(2);
    const search = flyouts()[1]!.querySelector('input')!;
    expect(document.activeElement).toBe(search);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not open a disabled trigger', async () => {
    renderMenu([customRow(true)]);
    expect(trigger().disabled).toBe(true);
    hover(trigger());
    trigger().click();
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextFrame();
    expect(flyouts()).toHaveLength(0);
  });

  it('throws outside a custom entry', () => {
    expect(() => render(
      () => <ContextMenuSubmenuTrigger submenu={submenu}>Export</ContextMenuSubmenuTrigger>,
      document.body,
    )).toThrow('ContextMenuSubmenuTrigger must be rendered inside a custom entry of a ContextMenu.');
  });
});
