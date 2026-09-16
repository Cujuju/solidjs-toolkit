import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import EditableListFlyout from '../EditableListFlyout';

// jsdom popover API stubs — same shape as anchored-popover package.
const originalMatches = HTMLElement.prototype.matches;

function installPopoverStubs(): void {
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
}

function uninstallPopoverStubs(): void {
  HTMLElement.prototype.matches = originalMatches;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).showPopover;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).hidePopover;
}

function makeAnchor(): HTMLElement {
  const el = document.createElement('button');
  el.getBoundingClientRect = () =>
    ({ top: 100, left: 50, right: 150, bottom: 130, width: 100, height: 30, x: 50, y: 100, toJSON: () => ({}) } as DOMRect);
  document.body.appendChild(el);
  return el;
}

let dispose: (() => void) | null = null;

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

function findRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-cuj-elr="row"]')) as HTMLElement[];
}

function findRowByName(name: string): HTMLElement | undefined {
  return findRows().find(
    (row) => row.querySelector('[data-cuj-elr="label-text"]')?.textContent === name,
  );
}

function findLabelInRow(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector('[data-cuj-elr="label"]');
}

function findAddButton(): HTMLButtonElement | null {
  return document.querySelector('[data-cuj-elf="add-button"]');
}

function findAddInput(): HTMLInputElement | null {
  return document.querySelector('[data-cuj-elf="add-input"]');
}

describe('EditableListFlyout', () => {
  it('renders one row per item with the item name', () => {
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    dispose = render(
      () => (
        <EditableListFlyout
          open={open}
          anchor={() => anchor}
          onDismiss={() => {}}
          items={[
            { id: 'a', name: 'Alpha' },
            { id: 'b', name: 'Beta' },
            { id: 'c', name: 'Gamma' },
          ]}
        />
      ),
      document.body,
    );

    expect(findRows()).toHaveLength(3);
    expect(findRowByName('Alpha')).toBeDefined();
    expect(findRowByName('Beta')).toBeDefined();
    expect(findRowByName('Gamma')).toBeDefined();
  });

  it('activate-on-row passes the item to onActivate', () => {
    const onActivate = vi.fn();
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    const items = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];
    dispose = render(
      () => (
        <EditableListFlyout
          open={open}
          anchor={() => anchor}
          onDismiss={() => {}}
          items={items}
          onActivate={onActivate}
        />
      ),
      document.body,
    );

    const betaRow = findRowByName('Beta')!;
    findLabelInRow(betaRow)!.click();
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(items[1]);
  });

  it('rename passes (item, next) to onRename', async () => {
    const onRename = vi.fn(() => Promise.resolve());
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    const items = [{ id: 'a', name: 'Old' }];
    dispose = render(
      () => (
        <EditableListFlyout
          open={open}
          anchor={() => anchor}
          onDismiss={() => {}}
          items={items}
          onRename={onRename}
        />
      ),
      document.body,
    );

    const row = findRowByName('Old')!;
    findLabelInRow(row)!.click();
    const input = row.querySelector('[data-cuj-elr="rename-input"]') as HTMLInputElement;
    input.value = 'New';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(items[0], 'New');
  });

  it('delete passes item to onDelete after confirmDelete accepts', async () => {
    const confirmDelete = vi.fn().mockResolvedValueOnce(true);
    const onDelete = vi.fn(() => Promise.resolve());
    const [open] = createSignal(true);
    const anchor = makeAnchor();
    const items = [{ id: 'a', name: 'Doomed' }];
    dispose = render(
      () => (
        <EditableListFlyout
          open={open}
          anchor={() => anchor}
          onDismiss={() => {}}
          items={items}
          onDelete={onDelete}
          confirmDelete={confirmDelete}
        />
      ),
      document.body,
    );

    const trash = document.querySelector('button[aria-label="Delete Doomed"]') as HTMLButtonElement;
    trash.click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(confirmDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(items[0]);
  });

  describe('add affordance', () => {
    it('renders the add button when onCreate provided', () => {
      const onCreate = vi.fn(() => Promise.resolve());
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            onCreate={onCreate}
          />
        ),
        document.body,
      );
      expect(findAddButton()).not.toBeNull();
    });

    it('does NOT render the add button when onCreate is omitted', () => {
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
          />
        ),
        document.body,
      );
      expect(findAddButton()).toBeNull();
    });

    it('click button → morphs to input', () => {
      const onCreate = vi.fn(() => Promise.resolve());
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            onCreate={onCreate}
          />
        ),
        document.body,
      );
      findAddButton()!.click();
      expect(findAddInput()).not.toBeNull();
      expect(findAddButton()).toBeNull();
    });

    it('Enter commits onCreate with trimmed value, exits input on success', async () => {
      const onCreate = vi.fn(() => Promise.resolve());
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            onCreate={onCreate}
          />
        ),
        document.body,
      );
      findAddButton()!.click();
      const input = findAddInput()!;
      input.value = '  My New Item  ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(onCreate).toHaveBeenCalledWith('My New Item');
      expect(findAddInput()).toBeNull();
      expect(findAddButton()).not.toBeNull();
    });

    it('Escape cancels — does not call onCreate', () => {
      const onCreate = vi.fn(() => Promise.resolve());
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            onCreate={onCreate}
          />
        ),
        document.body,
      );
      findAddButton()!.click();
      const input = findAddInput()!;
      input.value = 'Discard';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onCreate).not.toHaveBeenCalled();
      expect(findAddInput()).toBeNull();
      expect(findAddButton()).not.toBeNull();
    });

    it('blur-empty cancels; blur-with-value commits', async () => {
      const onCreate = vi.fn(() => Promise.resolve());
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            onCreate={onCreate}
          />
        ),
        document.body,
      );

      findAddButton()!.click();
      let input = findAddInput()!;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      expect(onCreate).not.toHaveBeenCalled();
      expect(findAddInput()).toBeNull();

      findAddButton()!.click();
      input = findAddInput()!;
      input.value = 'Commit';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(onCreate).toHaveBeenCalledWith('Commit');
    });

    it('keeps input open with typed value when onCreate rejects', async () => {
      const onCreate = vi.fn(() => Promise.reject(new Error('collision')));
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            onCreate={onCreate}
          />
        ),
        document.body,
      );
      findAddButton()!.click();
      const input = findAddInput()!;
      input.value = 'Conflicts';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      const stillInput = findAddInput();
      expect(stillInput).not.toBeNull();
      expect(stillInput!.value).toBe('Conflicts');
    });
  });

  describe('itemConfig per-row overrides', () => {
    it('applies leadingIcon from itemConfig to the matching row', () => {
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const items = [
        { id: 'a', name: 'WithIcon' },
        { id: 'b', name: 'Plain' },
      ];
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={items}
            itemConfig={(item) =>
              item.id === 'a'
                ? { leadingIcon: () => <span data-testid="star">★</span> }
                : {}
            }
          />
        ),
        document.body,
      );

      const iconRow = findRowByName('WithIcon')!;
      expect(iconRow.querySelector('[data-testid="star"]')).not.toBeNull();
      const plainRow = findRowByName('Plain')!;
      expect(plainRow.querySelector('[data-testid="star"]')).toBeNull();
    });

    it('uses itemConfig.selection when provided', () => {
      const onToggle = vi.fn();
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const items = [{ id: 'a', name: 'Checkable' }];
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={items}
            itemConfig={() => ({
              selection: { kind: 'checkbox', checked: false, onToggle },
            })}
          />
        ),
        document.body,
      );
      const row = findRowByName('Checkable')!;
      const cb = row.querySelector('[data-cuj-elr="checkbox"]') as HTMLInputElement;
      expect(cb).not.toBeNull();
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      // change event with default checked=false flips currentTarget.checked to true via the event-cycle
      // — we just assert the handler fired.
      expect(onToggle).toHaveBeenCalled();
    });

    it('per-item onActivate override wins over flyout-level onActivate', () => {
      const flyoutOnActivate = vi.fn();
      const itemOnActivate = vi.fn();
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const items = [{ id: 'a', name: 'OverrideMe' }];
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={items}
            onActivate={flyoutOnActivate}
            itemConfig={() => ({ onActivate: itemOnActivate })}
          />
        ),
        document.body,
      );

      const row = findRowByName('OverrideMe')!;
      findLabelInRow(row)!.click();
      expect(itemOnActivate).toHaveBeenCalledTimes(1);
      expect(flyoutOnActivate).not.toHaveBeenCalled();
    });
  });

  describe('per-item rename/delete opt-out', () => {
    it('disableRename suppresses pencil on that row even with flyout-level onRename', () => {
      const onRename = vi.fn(() => Promise.resolve());
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const items = [
        { id: 'a', name: 'Pinned' },
        { id: 'b', name: 'Editable' },
      ];
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={items}
            onRename={onRename}
            itemConfig={(item) => (item.id === 'a' ? { disableRename: true } : {})}
          />
        ),
        document.body,
      );
      expect(document.querySelector('button[aria-label="Rename Pinned"]')).toBeNull();
      expect(document.querySelector('button[aria-label="Rename Editable"]')).not.toBeNull();
    });

    it('disableDelete suppresses trash on that row even with flyout-level onDelete', () => {
      const onDelete = vi.fn(() => Promise.resolve());
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const items = [
        { id: 'a', name: 'Pinned' },
        { id: 'b', name: 'Deletable' },
      ];
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={items}
            onDelete={onDelete}
            itemConfig={(item) => (item.id === 'a' ? { disableDelete: true } : {})}
          />
        ),
        document.body,
      );
      expect(document.querySelector('button[aria-label="Delete Pinned"]')).toBeNull();
      expect(document.querySelector('button[aria-label="Delete Deletable"]')).not.toBeNull();
    });
  });

  describe('empty state', () => {
    it('renders emptyMessage when items is empty', () => {
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            emptyMessage="Nothing here yet"
          />
        ),
        document.body,
      );
      const empty = document.querySelector('[data-cuj-elf="empty"]');
      expect(empty?.textContent).toBe('Nothing here yet');
    });

    it('renders no empty placeholder when items is empty + emptyMessage omitted', () => {
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
          />
        ),
        document.body,
      );
      expect(document.querySelector('[data-cuj-elf="empty"]')).toBeNull();
    });
  });

  describe('itemConfig reactivity', () => {
    it('re-evaluates itemConfig when a signal it reads changes, without new item identities', () => {
      const [selected, setSelected] = createSignal(false);
      const [locked, setLocked] = createSignal(false);
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const items = [{ id: 'a', name: 'Alpha' }];
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={items}
            onDelete={() => Promise.resolve()}
            itemConfig={() => ({
              selection: { kind: 'checkbox', checked: selected(), onToggle: setSelected },
              deleteDisabled: locked(),
            })}
          />
        ),
        document.body,
      );
      const checkbox = () =>
        findRowByName('Alpha')!.querySelector('[data-cuj-elr="checkbox"]') as HTMLInputElement;
      const trash = () => document.querySelector('button[aria-label="Delete Alpha"]') as HTMLButtonElement;
      expect(checkbox().checked).toBe(false);
      expect(trash().disabled).toBe(false);

      setSelected(true);
      setLocked(true);
      expect(checkbox().checked).toBe(true);
      expect(trash().disabled).toBe(true);
    });

    it('forwards itemConfig.active to the row and tracks changes', () => {
      const [activeId, setActiveId] = createSignal('a');
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      const items = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={items}
            itemConfig={(item) => ({ active: activeId() === item.id })}
          />
        ),
        document.body,
      );
      expect(findRowByName('Alpha')!.getAttribute('data-active')).toBe('true');
      expect(findRowByName('Beta')!.hasAttribute('data-active')).toBe(false);

      setActiveId('b');
      expect(findRowByName('Alpha')!.hasAttribute('data-active')).toBe(false);
      expect(findRowByName('Beta')!.getAttribute('data-active')).toBe('true');
    });
  });

  describe('list semantics', () => {
    it('every item is an owned listitem of the role=list container', () => {
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[
              { id: 'a', name: 'Alpha' },
              { id: 'b', name: 'Beta' },
            ]}
          />
        ),
        document.body,
      );
      const list = document.querySelector('[data-cuj-elf="list"]')!;
      expect(list.getAttribute('role')).toBe('list');
      const listItems = Array.from(list.children).filter((el) => el.getAttribute('role') === 'listitem');
      expect(listItems).toHaveLength(2);
      for (const li of listItems) expect(li.querySelector('[data-cuj-elr="row"]')).not.toBeNull();
    });

    it('no token-declaring [data-cuj-elf] element sits between the list and its rows', () => {
      // `[data-cuj-elf]` redeclares every --cuj-elf-* default, so a wrapper matching it would reset list-level overrides.
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[{ id: 'a', name: 'Alpha' }]}
          />
        ),
        document.body,
      );
      const list = document.querySelector('[data-cuj-elf="list"]');
      for (const row of findRows()) expect(row.parentElement!.closest('[data-cuj-elf]')).toBe(list);
    });
  });

  describe('slot stability across itemConfig re-runs', () => {
    it('a focused leadingControl keeps its node and focus when selection toggles', () => {
      const [checked, setChecked] = createSignal(false);
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[{ id: 'a', name: 'Alpha' }]}
            itemConfig={() => ({
              leadingControl: () => <button data-testid="ctl">ctl</button>,
              selection: { kind: 'checkbox', checked: checked(), onToggle: setChecked },
            })}
          />
        ),
        document.body,
      );
      const ctl = document.querySelector('[data-testid="ctl"]') as HTMLButtonElement;
      ctl.focus();
      setChecked(true);
      expect(document.querySelector('[data-testid="ctl"]')).toBe(ctl);
      expect(document.activeElement).toBe(ctl);
    });

    it('a slot that appears on a later itemConfig run mounts', () => {
      const [withIcon, setWithIcon] = createSignal(false);
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[{ id: 'a', name: 'Alpha' }]}
            itemConfig={() => (withIcon() ? { leadingIcon: () => <span data-testid="star">★</span> } : {})}
          />
        ),
        document.body,
      );
      expect(document.querySelector('[data-testid="star"]')).toBeNull();
      setWithIcon(true);
      expect(document.querySelector('[data-testid="star"]')).not.toBeNull();
    });

    it('signals read inside a slot function still update the slot', () => {
      const [count, setCount] = createSignal(1);
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[{ id: 'a', name: 'Alpha' }]}
            itemConfig={() => ({ trailingLabel: () => `n=${count()}` })}
          />
        ),
        document.body,
      );
      const label = () => document.querySelector('[data-cuj-elr="trailing-label"]')?.textContent;
      expect(label()).toBe('n=1');
      setCount(2);
      expect(label()).toBe('n=2');
    });
  });

  describe('add affordance focus', () => {
    function renderCreatable(onCreate: (name: string) => Promise<void>): void {
      const [open] = createSignal(true);
      const anchor = makeAnchor();
      dispose = render(
        () => (
          <EditableListFlyout
            open={open}
            anchor={() => anchor}
            onDismiss={() => {}}
            items={[]}
            onCreate={onCreate}
          />
        ),
        document.body,
      );
    }

    function openFocusedInput(): HTMLInputElement {
      findAddButton()!.click();
      const input = findAddInput()!;
      input.focus();
      return input;
    }

    it('Escape returns focus to the add button', () => {
      renderCreatable(() => Promise.resolve());
      const input = openFocusedInput();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(findAddInput()).toBeNull();
      expect(document.activeElement).toBe(findAddButton());
    });

    it('successful Enter commit returns focus to the add button', async () => {
      renderCreatable(() => Promise.resolve());
      const input = openFocusedInput();
      input.value = 'Created';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(findAddInput()).toBeNull();
      expect(document.activeElement).toBe(findAddButton());
    });

    it('blur exit does not steal focus from where the user moved it', () => {
      renderCreatable(() => Promise.resolve());
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      openFocusedInput();
      outside.focus();
      expect(findAddInput()).toBeNull();
      expect(document.activeElement).toBe(outside);
    });

    function nextFrame(): Promise<void> {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }

    // jsdom doesn't blur a focused element on removal; Chrome does, synchronously. Emulate it.
    function emulateBlurOnRemoval(): () => void {
      const replaceChild = Node.prototype.replaceChild;
      const removeChild = Node.prototype.removeChild;
      const remove = Element.prototype.remove;
      const blurIfFocusedWithin = (node: Node): void => {
        const active = document.activeElement;
        if (active && node.contains(active)) active.dispatchEvent(new FocusEvent('blur'));
      };
      Node.prototype.replaceChild = function (this: Node, node: Node, child: Node) {
        blurIfFocusedWithin(child);
        return replaceChild.call(this, node, child);
      } as typeof replaceChild;
      Node.prototype.removeChild = function (this: Node, child: Node) {
        blurIfFocusedWithin(child);
        return removeChild.call(this, child);
      } as typeof removeChild;
      Element.prototype.remove = function (this: Element) {
        blurIfFocusedWithin(this);
        remove.call(this);
      };
      return () => {
        Node.prototype.replaceChild = replaceChild;
        Node.prototype.removeChild = removeChild;
        Element.prototype.remove = remove;
      };
    }

    it('Escape with typed text does not commit through the blur fired on unmount', async () => {
      const restoreDom = emulateBlurOnRemoval();
      try {
        const onCreate = vi.fn(() => Promise.resolve());
        renderCreatable(onCreate);
        const input = openFocusedInput();
        input.value = 'Typed';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(onCreate).not.toHaveBeenCalled();
        expect(findAddInput()).toBeNull();
        expect(document.activeElement).toBe(findAddButton());
      } finally {
        restoreDom();
      }
    });

    it('Enter commit rejection re-focuses the input after it re-enables', async () => {
      const onCreate = vi.fn(() => {
        const input = findAddInput()!;
        // jsdom neither blurs on disable nor blurs a disabled element; emulate the browser dropping focus.
        input.disabled = false;
        input.blur();
        input.disabled = true;
        return Promise.reject(new Error('collision'));
      });
      renderCreatable(onCreate);
      const input = openFocusedInput();
      // Flush startCreating's own after-paint focus so it can't mask a missing refocus.
      await nextFrame();
      input.value = 'Conflicts';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(document.activeElement).not.toBe(input);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      await nextFrame();
      expect(input.disabled).toBe(false);
      expect(document.activeElement).toBe(input);
    });

    function deferredOnCreate() {
      const settle: { resolve?: () => void; reject?: (e: Error) => void } = {};
      const onCreate = vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            settle.resolve = resolve;
            settle.reject = reject;
          }),
      );
      return { onCreate, settle };
    }

    async function enterWhilePending(value: string): Promise<HTMLButtonElement> {
      const input = openFocusedInput();
      await nextFrame();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      return outside;
    }

    it('successful commit does not pull focus from a control the user moved to during the await', async () => {
      const { onCreate, settle } = deferredOnCreate();
      renderCreatable(onCreate);
      const outside = await enterWhilePending('Created');
      settle.resolve!();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      await nextFrame();
      expect(findAddInput()).toBeNull();
      expect(document.activeElement).toBe(outside);
    });

    it('rejected commit does not pull focus from a control the user moved to during the await', async () => {
      const { onCreate, settle } = deferredOnCreate();
      renderCreatable(onCreate);
      const outside = await enterWhilePending('Conflicts');
      settle.reject!(new Error('collision'));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      await nextFrame();
      expect(findAddInput()).not.toBeNull();
      expect(document.activeElement).toBe(outside);
    });
  });
});
