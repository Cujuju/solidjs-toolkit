import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import EditableListRow from '../EditableListRow';

let dispose: (() => void) | null = null;

beforeEach(() => {
  // Default window.confirm to reject so the fallback path doesn't fire
  // any pending onDelete handlers under tests that don't explicitly opt
  // into confirm mocking.
});

afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

function findRenameInput(): HTMLInputElement | null {
  return document.querySelector('[data-cuj-elr="rename-input"]');
}

function findCheckbox(): HTMLInputElement | null {
  return document.querySelector('[data-cuj-elr="checkbox"]');
}

function findButtonByAriaLabel(label: string): HTMLButtonElement | null {
  return document.querySelector(`button[aria-label="${label}"]`);
}

function findLabelButton(): HTMLButtonElement | null {
  return document.querySelector('[data-cuj-elr="label"]');
}

describe('EditableListRow', () => {
  describe('selection: none', () => {
    it('renders no checkbox', () => {
      dispose = render(
        () => (
          <EditableListRow id="r1" name="Row 1" selection={{ kind: 'none' }} />
        ),
        document.body,
      );
      expect(findCheckbox()).toBeNull();
    });

    it('falls through to startRename on body click when onActivate absent + onRename provided', () => {
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'none' }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      expect(findRenameInput()).not.toBeNull();
    });

    it('invokes onActivate on body click when provided (does not start rename)', () => {
      const onActivate = vi.fn();
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'none' }}
            onActivate={onActivate}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(findRenameInput()).toBeNull();
    });
  });

  describe('selection: checkbox', () => {
    it('renders a checkbox reflecting checked + disabled', () => {
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{
              kind: 'checkbox',
              checked: true,
              disabled: true,
              onToggle: () => {},
            }}
          />
        ),
        document.body,
      );
      const cb = findCheckbox();
      expect(cb).not.toBeNull();
      expect(cb!.checked).toBe(true);
      expect(cb!.disabled).toBe(true);
    });

    it('body click toggles the checkbox (does not enter rename) when onRename provided', () => {
      const onToggle = vi.fn();
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'checkbox', checked: false, onToggle }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(findRenameInput()).toBeNull();
    });

    it('body click is a no-op when checkbox is disabled', () => {
      const onToggle = vi.fn();
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'checkbox', checked: false, disabled: true, onToggle }}
            onRename={() => Promise.resolve()}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  describe('inline rename', () => {
    it('Enter saves via onRename and exits rename mode on success', async () => {
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      const input = findRenameInput();
      expect(input).not.toBeNull();
      input!.value = 'New Name';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onRename).toHaveBeenCalledWith('New Name');
      await Promise.resolve();
      await Promise.resolve();
      expect(findRenameInput()).toBeNull();
    });

    it('STAYS in rename mode with typed value preserved when onRename rejects', async () => {
      const onRename = vi.fn(() => Promise.reject(new Error('collision')));
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      const input = findRenameInput();
      input!.value = 'Conflicts';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onRename).toHaveBeenCalledWith('Conflicts');
      await Promise.resolve();
      await Promise.resolve();
      const stillInput = findRenameInput();
      expect(stillInput).not.toBeNull();
      expect(stillInput!.value).toBe('Conflicts');
    });

    it('disables the input while the save promise is in flight', async () => {
      let resolveOnRename: () => void = () => {};
      const onRename = vi.fn(
        () => new Promise<void>((resolve) => { resolveOnRename = resolve; }),
      );
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      const input = findRenameInput();
      input!.value = 'In Flight';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
      const pendingInput = findRenameInput();
      expect(pendingInput).not.toBeNull();
      expect(pendingInput!.disabled).toBe(true);
      resolveOnRename();
      await Promise.resolve();
      await Promise.resolve();
      expect(findRenameInput()).toBeNull();
    });

    it('Escape cancels — onRename not called, input dismisses', () => {
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      const input = findRenameInput();
      input!.value = 'Discarded';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onRename).not.toHaveBeenCalled();
      expect(findRenameInput()).toBeNull();
    });

    it('blur saves the trimmed value', () => {
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      const input = findRenameInput();
      input!.value = 'After Blur';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('blur', { bubbles: true }));
      expect(onRename).toHaveBeenCalledWith('After Blur');
    });

    it('skips onRename when value unchanged', () => {
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Same"
            selection={{ kind: 'none' }}
            onRename={onRename}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      const input = findRenameInput();
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onRename).not.toHaveBeenCalled();
    });

    it('explicit pencil click enters rename without invoking onActivate', () => {
      const onActivate = vi.fn();
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onActivate={onActivate}
            onRename={onRename}
          />
        ),
        document.body,
      );
      const pencil = findButtonByAriaLabel('Rename Old');
      pencil!.click();
      expect(onActivate).not.toHaveBeenCalled();
      expect(findRenameInput()).not.toBeNull();
    });
  });

  describe('delete with confirm', () => {
    it('invokes confirmDelete prop with row name in body; calls onDelete on accept', async () => {
      const confirmDelete = vi.fn().mockResolvedValueOnce(true);
      const onDelete = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Doomed"
            selection={{ kind: 'none' }}
            onDelete={onDelete}
            confirmDelete={confirmDelete}
          />
        ),
        document.body,
      );
      const trash = findButtonByAriaLabel('Delete Doomed');
      trash!.click();
      // Flush enough microtasks for the chained `await confirmDelete()`
      // and `await onDelete()` to settle (handleDelete is async; the
      // click handler doesn't await it).
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(confirmDelete).toHaveBeenCalledTimes(1);
      const opts = confirmDelete.mock.calls[0]?.[0] as { message: string };
      expect(opts.message).toContain('Doomed');
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('skips onDelete when confirmDelete resolves false', async () => {
      const confirmDelete = vi.fn().mockResolvedValueOnce(false);
      const onDelete = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Spared"
            selection={{ kind: 'none' }}
            onDelete={onDelete}
            confirmDelete={confirmDelete}
          />
        ),
        document.body,
      );
      findButtonByAriaLabel('Delete Spared')!.click();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('falls back to window.confirm when confirmDelete is omitted', async () => {
      const origConfirm = window.confirm;
      const confirmSpy = vi.fn(() => true);
      window.confirm = confirmSpy as unknown as typeof window.confirm;

      const onDelete = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Doomed"
            selection={{ kind: 'none' }}
            onDelete={onDelete}
          />
        ),
        document.body,
      );
      findButtonByAriaLabel('Delete Doomed')!.click();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(confirmSpy).toHaveBeenCalledWith('Delete "Doomed"?');
      expect(onDelete).toHaveBeenCalledTimes(1);

      window.confirm = origConfirm;
    });
  });

  describe('busy state', () => {
    it('blocks body click when busy() returns true', () => {
      const onActivate = vi.fn();
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'none' }}
            onActivate={onActivate}
            busy={() => true}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      expect(onActivate).not.toHaveBeenCalled();
    });

    it('sets aria-busy="true" on the row', () => {
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'none' }}
            busy={() => true}
          />
        ),
        document.body,
      );
      const row = document.querySelector('[aria-busy="true"]');
      expect(row).not.toBeNull();
    });
  });

  describe('leading slot', () => {
    it('renders leadingIcon when only it is provided', () => {
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'none' }}
            leadingIcon={() => <span data-testid="icon">★</span>}
          />
        ),
        document.body,
      );
      expect(document.querySelector('[data-testid="icon"]')).not.toBeNull();
    });

    it('renders leadingControl when only it is provided', () => {
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'none' }}
            leadingControl={() => <button data-testid="ctrl">Toggle</button>}
          />
        ),
        document.body,
      );
      expect(document.querySelector('[data-testid="ctrl"]')).not.toBeNull();
    });

    it('leadingControl wins when both are provided', () => {
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row 1"
            selection={{ kind: 'none' }}
            leadingIcon={() => <span data-testid="icon">★</span>}
            leadingControl={() => <button data-testid="ctrl">Toggle</button>}
          />
        ),
        document.body,
      );
      expect(document.querySelector('[data-testid="ctrl"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="icon"]')).toBeNull();
    });
  });

  describe('external rename trigger (pendingRename + onRenameClose)', () => {
    it('false → true edge enters rename mode', () => {
      const [pending, setPending] = createSignal(false);
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="X"
            selection={{ kind: 'none' }}
            onRename={() => Promise.resolve()}
            pendingRename={pending}
          />
        ),
        document.body,
      );
      expect(findRenameInput()).toBeNull();
      setPending(true);
      expect(findRenameInput()).not.toBeNull();
    });

    it('does NOT re-trigger if pending stays true after Escape (edge-trigger)', () => {
      const [pending, setPending] = createSignal(false);
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="X"
            selection={{ kind: 'none' }}
            onRename={() => Promise.resolve()}
            pendingRename={pending}
          />
        ),
        document.body,
      );
      setPending(true);
      const input = findRenameInput();
      expect(input).not.toBeNull();
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(findRenameInput()).toBeNull();
      expect(findRenameInput()).toBeNull();
    });

    it('fires onRenameClose on commit + on cancel', async () => {
      const onClose = vi.fn();
      const [pending, setPending] = createSignal(false);
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="X"
            selection={{ kind: 'none' }}
            onRename={() => Promise.resolve()}
            pendingRename={pending}
            onRenameClose={() => {
              onClose();
              setPending(false);
            }}
          />
        ),
        document.body,
      );
      setPending(true);
      let input = findRenameInput();
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      setPending(true);
      input = findRenameInput();
      input!.value = 'Y';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('reorder', () => {
    it('renders drag handle when reorderProps provided + spreads them on row', () => {
      const reorderProps = { 'data-reorder-id': 'r1', onPointerDown: vi.fn() };
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="X"
            selection={{ kind: 'none' }}
            reorderProps={reorderProps}
          />
        ),
        document.body,
      );
      const row = document.querySelector('[data-reorder-id="r1"]');
      expect(row).not.toBeNull();
    });

    it('skips drag handle when reorderProps is omitted', () => {
      dispose = render(
        () => (
          <EditableListRow id="r1" name="X" selection={{ kind: 'none' }} />
        ),
        document.body,
      );
      expect(document.querySelector('[data-reorder-id]')).toBeNull();
    });
  });
});
