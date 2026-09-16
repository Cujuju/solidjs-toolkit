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
      expect(findButtonByAriaLabel('Delete Spared')!.disabled).toBe(false);
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

// Vitest runs on Node, but this package has no @types/node; type only what the rejection test uses.
declare const process: {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
};

const MICROTASK_FLUSH_ROUNDS = 5;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < MICROTASK_FLUSH_ROUNDS; i++) await Promise.resolve();
}

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

describe('EditableListRow regressions', () => {
  describe('checkbox selection reactivity', () => {
    it('updates checked/disabled on the SAME input node and calls the latest onToggle', () => {
      const [checked, setChecked] = createSignal(false);
      const [disabled, setDisabled] = createSignal(false);
      const first = vi.fn();
      const second = vi.fn();
      const [useSecond, setUseSecond] = createSignal(false);
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row"
            selection={{
              kind: 'checkbox',
              checked: checked(),
              disabled: disabled(),
              onToggle: useSecond() ? second : first,
            }}
          />
        ),
        document.body,
      );
      const cb = findCheckbox()!;
      setChecked(true);
      expect(findCheckbox()).toBe(cb);
      expect(cb.checked).toBe(true);
      setDisabled(true);
      expect(cb.disabled).toBe(true);
      setDisabled(false);
      setUseSecond(true);
      expect(findCheckbox()).toBe(cb);
      cb.click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('keeps focus on the checkbox across a toggle-driven selection change', () => {
      const [checked, setChecked] = createSignal(false);
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Row"
            selection={{ kind: 'checkbox', checked: checked(), onToggle: setChecked }}
          />
        ),
        document.body,
      );
      const cb = findCheckbox()!;
      cb.focus();
      cb.click();
      expect(document.activeElement).toBe(cb);
    });
  });

  describe('busy() is enforced at commit points', () => {
    it('does not call onRename when busy flips true while renaming', () => {
      const [busy, setBusy] = createSignal(false);
      const onRename = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
            busy={busy}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      const input = findRenameInput()!;
      input.value = 'New';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setBusy(true);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      expect(onRename).not.toHaveBeenCalled();
    });

    it('still calls onDelete when busy flips true after the confirm opened', async () => {
      const [busy, setBusy] = createSignal(false);
      let resolveConfirm: (ok: boolean) => void = () => {};
      const confirmDelete = vi.fn(
        () => new Promise<boolean>((resolve) => { resolveConfirm = resolve; }),
      );
      const onDelete = vi.fn(() => Promise.resolve());
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Doomed"
            selection={{ kind: 'none' }}
            onDelete={onDelete}
            confirmDelete={confirmDelete}
            busy={busy}
          />
        ),
        document.body,
      );
      findButtonByAriaLabel('Delete Doomed')!.click();
      setBusy(true);
      resolveConfirm(true);
      await flushMicrotasks();
      expect(onDelete).toHaveBeenCalledTimes(1);
      setBusy(false);
      expect(findButtonByAriaLabel('Delete Doomed')!.disabled).toBe(false);
    });
  });

  describe('rename focus management', () => {
    function renderRenameRow(onRename: (next: string) => Promise<void>): void {
      dispose = render(
        () => (
          <EditableListRow id="r1" name="Old" selection={{ kind: 'none' }} onRename={onRename} />
        ),
        document.body,
      );
    }

    it('Escape returns focus to the label button', async () => {
      renderRenameRow(() => Promise.resolve());
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      expect(document.activeElement).toBe(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await nextFrame();
      expect(document.activeElement).toBe(findLabelButton());
    });

    it('Enter commit success returns focus to the label button', async () => {
      renderRenameRow(() => Promise.resolve());
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      input.value = 'New';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushMicrotasks();
      await nextFrame();
      expect(document.activeElement).toBe(findLabelButton());
    });

    it('Enter commit rejection re-focuses the input after it re-enables', async () => {
      renderRenameRow(() => Promise.reject(new Error('collision')));
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      input.value = 'Conflicts';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      // jsdom neither blurs on disable nor blurs a disabled element; emulate the browser dropping focus.
      input.disabled = false;
      input.blur();
      input.disabled = true;
      expect(document.activeElement).not.toBe(input);
      await flushMicrotasks();
      await nextFrame();
      expect(input.disabled).toBe(false);
      expect(document.activeElement).toBe(input);
    });

    it('blur commit does not pull focus back into the row', async () => {
      renderRenameRow(() => Promise.resolve());
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      input.value = 'New';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      outside.focus();
      await flushMicrotasks();
      await nextFrame();
      expect(document.activeElement).toBe(outside);
    });
  });

  describe('pendingRename while busy', () => {
    it('defers an external rename refused by busy() until busy clears', () => {
      const [busy, setBusy] = createSignal(true);
      const [pending, setPending] = createSignal(false);
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="X"
            selection={{ kind: 'none' }}
            onRename={() => Promise.resolve()}
            pendingRename={pending}
            busy={busy}
          />
        ),
        document.body,
      );
      setPending(true);
      expect(findRenameInput()).toBeNull();
      setBusy(false);
      expect(findRenameInput()).not.toBeNull();
    });
  });

  describe('delete robustness', () => {
    it('swallows an onDelete rejection instead of leaking an unhandled rejection', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      const onDelete = vi.fn(() => Promise.reject(new Error('offline')));
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Doomed"
            selection={{ kind: 'none' }}
            onDelete={onDelete}
            confirmDelete={() => Promise.resolve(true)}
          />
        ),
        document.body,
      );
      findButtonByAriaLabel('Delete Doomed')!.click();
      await flushMicrotasks();
      await new Promise((resolve) => setTimeout(resolve));
      process.off('unhandledRejection', unhandled);
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
      expect(findButtonByAriaLabel('Delete Doomed')!.disabled).toBe(false);
    });

    it('disables the trash button while confirm/delete is in flight', async () => {
      let resolveConfirm: (ok: boolean) => void = () => {};
      const confirmDelete = vi.fn(
        () => new Promise<boolean>((resolve) => { resolveConfirm = resolve; }),
      );
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
      const trash = findButtonByAriaLabel('Delete Doomed')!;
      trash.click();
      expect(trash.disabled).toBe(true);
      trash.click();
      expect(confirmDelete).toHaveBeenCalledTimes(1);
      resolveConfirm(true);
      await flushMicrotasks();
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(trash.disabled).toBe(false);
    });
  });

  describe('rename exits with browser blur-on-unmount', () => {
    async function openRename(onRename: (next: string) => Promise<void>, onRenameClose: () => void) {
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
            onRenameClose={onRenameClose}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      await nextFrame();
      return findRenameInput()!;
    }

    it('Escape after typing does not commit and closes once', async () => {
      const onRename = vi.fn(() => Promise.resolve());
      const onClose = vi.fn();
      const input = await openRename(onRename, onClose);
      input.value = 'Typed';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const restore = emulateBlurOnRemoval();
      try {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } finally {
        restore();
      }
      await flushMicrotasks();
      expect(onRename).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Enter with an unchanged value closes once', async () => {
      const onClose = vi.fn();
      const input = await openRename(() => Promise.resolve(), onClose);
      const restore = emulateBlurOnRemoval();
      try {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      } finally {
        restore();
      }
      await flushMicrotasks();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Enter success after the consumer renamed closes once', async () => {
      const [name, setName] = createSignal('Old');
      const onClose = vi.fn();
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name={name()}
            selection={{ kind: 'none' }}
            onRename={async (next) => { setName(next); }}
            onRenameClose={onClose}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      input.value = 'New';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const restore = emulateBlurOnRemoval();
      try {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await flushMicrotasks();
      } finally {
        restore();
      }
      expect(findRenameInput()).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard save does not steal focus moved elsewhere', () => {
    async function enterWhileSaving(settle: (deferred: { resolve: () => void; reject: (e: Error) => void }) => void) {
      let deferred = { resolve: () => {}, reject: (_e: Error) => {} };
      const onRename = () => new Promise<void>((resolve, reject) => { deferred = { resolve, reject }; });
      dispose = render(
        () => (
          <EditableListRow id="r1" name="Old" selection={{ kind: 'none' }} onRename={onRename} />
        ),
        document.body,
      );
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      input.value = 'New';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      outside.focus();
      settle(deferred);
      await flushMicrotasks();
      await nextFrame();
      return outside;
    }

    it('on success', async () => {
      const outside = await enterWhileSaving((d) => d.resolve());
      expect(findRenameInput()).toBeNull();
      expect(document.activeElement).toBe(outside);
    });

    it('on rejection', async () => {
      const outside = await enterWhileSaving((d) => d.reject(new Error('collision')));
      expect(findRenameInput()).not.toBeNull();
      expect(document.activeElement).toBe(outside);
    });
  });

  describe('blur refused while busy', () => {
    function renderBusyRow() {
      const [busy, setBusy] = createSignal(false);
      const onRename = vi.fn(() => Promise.resolve());
      const onClose = vi.fn();
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Old"
            selection={{ kind: 'none' }}
            onRename={onRename}
            onRenameClose={onClose}
            busy={busy}
          />
        ),
        document.body,
      );
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      return { setBusy, onRename, onClose, outside };
    }

    it('keeps the typed value, then commits once busy clears', async () => {
      const { setBusy, onRename, onClose, outside } = renderBusyRow();
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      input.value = 'New';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setBusy(true);
      outside.focus();
      expect(onRename).not.toHaveBeenCalled();
      expect(findRenameInput()!.value).toBe('New');
      expect(onClose).not.toHaveBeenCalled();
      setBusy(false);
      expect(onRename).toHaveBeenCalledWith('New');
      await flushMicrotasks();
      expect(findRenameInput()).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(outside);
    });

    it('does not commit when busy clears if the input regained focus', async () => {
      const { setBusy, onRename, outside } = renderBusyRow();
      findLabelButton()!.click();
      await nextFrame();
      const input = findRenameInput()!;
      input.value = 'New';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setBusy(true);
      outside.focus();
      input.focus();
      setBusy(false);
      expect(onRename).not.toHaveBeenCalled();
      expect(findRenameInput()).toBe(input);
    });
  });

  describe('trash button focus', () => {
    it('restores focus to the trash button after the confirm is cancelled', async () => {
      let resolveConfirm: (ok: boolean) => void = () => {};
      const confirmDelete = () => new Promise<boolean>((resolve) => { resolveConfirm = resolve; });
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Doomed"
            selection={{ kind: 'none' }}
            onDelete={() => Promise.resolve()}
            confirmDelete={confirmDelete}
          />
        ),
        document.body,
      );
      const trash = findButtonByAriaLabel('Delete Doomed')!;
      trash.focus();
      trash.click();
      expect(trash.disabled).toBe(true);
      // jsdom doesn't blur on disable; emulate the browser dropping focus.
      trash.disabled = false;
      trash.blur();
      trash.disabled = true;
      expect(document.activeElement).not.toBe(trash);
      resolveConfirm(false);
      await flushMicrotasks();
      await nextFrame();
      expect(trash.disabled).toBe(false);
      expect(document.activeElement).toBe(trash);
    });

    it('restores focus when a confirm dialog unmounts after it resolves', async () => {
      let resolveConfirm: (ok: boolean) => void = () => {};
      const dialogButton = document.createElement('button');
      const confirmDelete = () =>
        new Promise<boolean>((resolve) => {
          document.body.appendChild(dialogButton);
          dialogButton.focus();
          resolveConfirm = resolve;
        });
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Doomed"
            selection={{ kind: 'none' }}
            onDelete={() => Promise.resolve()}
            confirmDelete={confirmDelete}
          />
        ),
        document.body,
      );
      const trash = findButtonByAriaLabel('Delete Doomed')!;
      trash.focus();
      trash.click();
      expect(document.activeElement).toBe(dialogButton);
      resolveConfirm(false);
      await flushMicrotasks();
      dialogButton.remove();
      await nextFrame();
      expect(document.activeElement).toBe(trash);
    });
  });

  describe('rename input accessible name', () => {
    it('labels the rename input (default and override)', () => {
      const [label, setLabel] = createSignal<string | undefined>(undefined);
      dispose = render(
        () => (
          <EditableListRow
            id="r1"
            name="Quarterly Report"
            selection={{ kind: 'none' }}
            onRename={() => Promise.resolve()}
            renameAriaLabel={label()}
          />
        ),
        document.body,
      );
      findLabelButton()!.click();
      expect(findRenameInput()!.getAttribute('aria-label')).toBe('Rename Quarterly Report');
      setLabel('Rename report');
      expect(findRenameInput()!.getAttribute('aria-label')).toBe('Rename report');
    });
  });
});
