import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { ContextMenu } from '../ContextMenu';
import type { ContextMenuEntry } from '../types';

// jsdom does not implement the Popover API. Stub HTMLElement.prototype
// with no-op showPopover/hidePopover + a :popover-open matcher so the
// onMount → showPopover() path doesn't blow up. matches() falls back
// to the original for every other selector.
const originalMatches = HTMLElement.prototype.matches;

function installPopoverStubs(): void {
  let popoverOpen = false;
  HTMLElement.prototype.matches = function (selectors: string): boolean {
    if (selectors === ':popover-open') return popoverOpen;
    return originalMatches.call(this, selectors);
  };
  (HTMLElement.prototype as HTMLElement & {
    showPopover: () => void;
    hidePopover: () => void;
  }).showPopover = function () {
    popoverOpen = true;
  };
  (HTMLElement.prototype as HTMLElement & {
    showPopover: () => void;
    hidePopover: () => void;
  }).hidePopover = function () {
    popoverOpen = false;
  };
}

function uninstallPopoverStubs(): void {
  HTMLElement.prototype.matches = originalMatches;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).showPopover;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).hidePopover;
}

let dispose: (() => void) | null = null;

function renderMenu(items: ContextMenuEntry[], onClose: () => void): void {
  dispose = render(
    () => <ContextMenu x={10} y={10} onClose={onClose} items={items} />,
    document.body,
  );
}

beforeEach(() => {
  installPopoverStubs();
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

afterEach(() => {
  dispose?.();
  dispose = null;
  uninstallPopoverStubs();
  document.body.innerHTML = '';
});

describe('ContextMenu — dismiss', () => {
  it('calls onClose when mousedown lands outside the menu', () => {
    const onClose = vi.fn();
    renderMenu([{ label: 'Item', onClick: () => {} }], onClose);

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when mousedown is inside the menu', () => {
    const onClose = vi.fn();
    renderMenu([{ label: 'Item', onClick: () => {} }], onClose);

    const menu = document.querySelector('.cujuju-context-menu') as HTMLElement;
    const item = menu.querySelector('.cujuju-context-menu-item') as HTMLElement;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT call onClose when mousedown is inside an element marked [data-popover-stack]', () => {
    // Regression guard: a submenu is Portal'd to <body>, OUTSIDE the
    // menu root. The dismiss check must skip clicks inside any element
    // marked with the [data-popover-stack] wire-contract attribute.
    // This sets ONLY the attribute (no class), proving the contract.
    const onClose = vi.fn();
    renderMenu([{ label: 'Item', onClick: () => {} }], onClose);

    const submenu = document.createElement('div');
    submenu.setAttribute('data-popover-stack', '');
    document.body.appendChild(submenu);
    const sliderItem = document.createElement('button');
    submenu.appendChild(sliderItem);

    sliderItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    renderMenu([{ label: 'Item', onClick: () => {} }], onClose);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ContextMenu — entries', () => {
  it('renders one button per item and a divider as <hr>', () => {
    renderMenu(
      [
        { label: 'One', onClick: () => {} },
        { divider: true },
        { label: 'Two', onClick: () => {} },
      ],
      () => {},
    );

    const menu = document.querySelector('.cujuju-context-menu') as HTMLElement;
    expect(menu.querySelectorAll('.cujuju-context-menu-item')).toHaveLength(2);
    expect(menu.querySelectorAll('hr.cujuju-context-menu-divider')).toHaveLength(1);
  });

  it('runs onClick then onClose when an item is activated', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    renderMenu([{ label: 'Go', onClick }], onClose);

    const item = document.querySelector('.cujuju-context-menu-item') as HTMLButtonElement;
    item.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu open after a keepOpen item is activated', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    renderMenu([{ label: 'Toggle', onClick, keepOpen: true }], onClose);

    const item = document.querySelector('.cujuju-context-menu-item') as HTMLButtonElement;
    item.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marks a disabled item with the disabled attribute', () => {
    renderMenu([{ label: 'Nope', onClick: () => {}, disabled: true }], () => {});

    const item = document.querySelector('.cujuju-context-menu-item') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
  });

  it('renders the checkbox indicator only when `checked` is defined', () => {
    renderMenu(
      [
        { label: 'On', onClick: () => {}, checked: true },
        { label: 'Off', onClick: () => {}, checked: false },
        { label: 'Plain', onClick: () => {} },
      ],
      () => {},
    );

    const checks = document.querySelectorAll('.cujuju-context-menu-check');
    expect(checks).toHaveLength(2);
    expect((checks[0] as HTMLElement).dataset.checked).toBe('true');
    expect((checks[1] as HTMLElement).dataset.checked).toBe('false');
  });

  it('hides an item whose `when` predicate returns false', () => {
    renderMenu(
      [
        { label: 'Shown', onClick: () => {}, when: () => true },
        { label: 'Hidden', onClick: () => {}, when: () => false },
      ],
      () => {},
    );

    expect(document.querySelectorAll('.cujuju-context-menu-item')).toHaveLength(1);
  });

  it('renders a button row', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    renderMenu(
      [{ row: true, buttons: [{ label: 'Prev', onClick }, { label: 'Next', onClick: () => {} }] }],
      onClose,
    );

    const row = document.querySelector('.cujuju-context-menu-button-row') as HTMLElement;
    const buttons = row.querySelectorAll('.cujuju-context-menu-row-btn');
    expect(buttons).toHaveLength(2);

    (buttons[0] as HTMLButtonElement).click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
