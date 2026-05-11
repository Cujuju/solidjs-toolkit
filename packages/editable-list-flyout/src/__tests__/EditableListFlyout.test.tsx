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
});
