import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { Show, createEffect, createSignal, on, type JSX } from 'solid-js';
import { GripVerticalIcon, PencilIcon, Trash2Icon } from './_internal/icons';
import type { ConfirmDeleteParams, EditableListRowProps, SelectionMode } from './types';
export type { ConfirmDeleteParams, EditableListRowProps, SelectionMode } from './types';

export default function EditableListRow(props: EditableListRowProps): JSX.Element {
  const [renaming, setRenaming] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal('');
  // Gates input + commit while an `onRename` promise resolves; distinct from the consumer's
  // `busy()`. On rejection the row keeps rename mode and the typed value.
  const [savePending, setSavePending] = createSignal(false);
  const [deletePending, setDeletePending] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  let labelRef: HTMLButtonElement | undefined;
  let trashRef: HTMLButtonElement | undefined;
  // A blur commit refused by busy(); re-run when busy clears so "blur saves" holds.
  let blurCommitDeferred = false;
  const afterPaint = createAfterPaint();

  function startRename(): boolean {
    if (props.busy?.() || !props.onRename) return false;
    blurCommitDeferred = false;
    setRenameValue(props.name);
    setRenaming(true);
    return true;
  }

  // Restore focus only if it was dropped to <body>, never if the user moved it elsewhere.
  function focusIfDropped(el: HTMLElement | undefined): void {
    if (!el?.isConnected) return;
    const active = document.activeElement;
    if (active === null || active === document.body) el.focus();
  }

  // Keyboard exits unmount the focused input; hand focus to the label that replaces it.
  function focusLabelAfterExit(): void {
    afterPaint(() => focusIfDropped(labelRef));
  }

  async function commitRename(fromKeyboard: boolean): Promise<void> {
    // Browsers fire blur synchronously when the focused input unmounts; that exit is already handled.
    if (!renaming()) return;
    const trimmed = renameValue().trim();
    if (!trimmed || trimmed === props.name || !props.onRename) {
      // No-op exits — close immediately, no callback.
      setRenaming(false);
      props.onRenameClose?.();
      if (fromKeyboard) focusLabelAfterExit();
      return;
    }
    if (savePending()) return;
    if (props.busy?.()) {
      if (!fromKeyboard) blurCommitDeferred = true;
      return;
    }
    setSavePending(true);
    try {
      await props.onRename(trimmed);
      setRenaming(false);
      props.onRenameClose?.();
      if (fromKeyboard) focusLabelAfterExit();
    } catch {
      // Reject: stay in rename mode with the typed value; no onRenameClose, the row hasn't exited.
      // Browsers drop focus from the disabled input; restore it after it re-enables.
      if (fromKeyboard) afterPaint(() => focusIfDropped(inputRef));
    } finally {
      setSavePending(false);
    }
  }

  function cancelRename(): void {
    setRenaming(false);
    props.onRenameClose?.();
    focusLabelAfterExit();
  }

  async function confirmDeleteWith(): Promise<boolean> {
    const params: ConfirmDeleteParams = {
      title: props.deleteConfirmTitle ?? 'Delete',
      message: props.deleteConfirmMessage ?? `Delete "${props.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    };
    if (props.confirmDelete) {
      return props.confirmDelete(params);
    }
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return Promise.resolve(window.confirm(params.message));
    }
    return Promise.resolve(false);
  }

  async function handleDelete(): Promise<void> {
    if (props.busy?.() || !props.onDelete || deletePending()) return;
    setDeletePending(true);
    try {
      const ok = await confirmDeleteWith();
      // busy() is checked before the confirm opens; an explicit confirmation is honoured even if busy() turned true meanwhile.
      if (!ok) return;
      await props.onDelete();
    } catch {
      // Like onRename, the consumer surfaces delete errors; don't leak an unhandled rejection.
    } finally {
      setDeletePending(false);
      // Browsers drop focus from the disabled trash button; restore it if the row survived.
      // After paint: a confirm dialog may still hold focus when it resolves and unmount later.
      afterPaint(() => focusIfDropped(trashRef));
    }
  }

  function handleBodyClick(): void {
    if (props.busy?.() || renaming()) return;
    if (props.onActivate) {
      props.onActivate();
      return;
    }
    if (props.selection.kind === 'checkbox' && !props.selection.disabled) {
      props.selection.onToggle(!props.selection.checked);
      return;
    }
    if (props.onRename) {
      startRename();
    }
  }

  createEffect(
    on(
      () => props.busy?.() ?? false,
      (busy) => {
        if (busy || !blurCommitDeferred) return;
        blurCommitDeferred = false;
        if (renaming() && document.activeElement !== inputRef) void commitRename(false);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    if (renaming() && inputRef) {
      afterPaint(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  });

  // Edge-triggered (false → true) so a parent holding the signal true doesn't re-trigger after
  // an Escape cancel.
  let lastPending = false;
  createEffect(() => {
    const pending = props.pendingRename?.() ?? false;
    if (pending && !lastPending && !renaming() && props.onRename) {
      // Refused (busy): leave the edge unconsumed so it fires once busy clears.
      if (!startRename()) return;
    }
    lastPending = pending;
  });

  return (
    <div
      data-cuj-elr="row"
      data-active={props.active ? 'true' : undefined}
      onContextMenu={props.onContextMenu}
      title={props.infoTooltip}
      aria-busy={props.busy?.() ? 'true' : undefined}
      {...(props.reorderProps ?? {})}
    >
      <Show when={props.reorderProps}>
        <span data-cuj-elr="drag-handle" aria-hidden="true">
          <GripVerticalIcon size={14} />
        </span>
      </Show>

      {/* Leading slot — interactive control wins when both are
          provided. Both render inside the same flex slot; the consumer
          owns visual styling for the control branch. */}
      <Show
        when={props.leadingControl}
        fallback={
          <Show when={props.leadingIcon}>
            <span data-cuj-elr="leading-icon" aria-hidden="true">
              {props.leadingIcon!()}
            </span>
          </Show>
        }
      >
        {/* Inert while busy: `pointer-events: none` alone leaves keyboard activation open. */}
        <span data-cuj-elr="leading-control" inert={props.busy?.() ?? false}>
          {props.leadingControl!()}
        </span>
      </Show>

      <Show when={props.selection.kind === 'checkbox'}>
        {(() => {
          const sel = () => props.selection as Extract<SelectionMode, { kind: 'checkbox' }>;
          return (
            <input
              type="checkbox"
              data-cuj-elr="checkbox"
              checked={sel().checked}
              disabled={sel().disabled || props.busy?.()}
              onChange={(e) => sel().onToggle(e.currentTarget.checked)}
              aria-label={`Toggle ${props.name}`}
              data-no-drag
            />
          );
        })()}
      </Show>

      <Show
        when={renaming()}
        fallback={
          <button
            type="button"
            data-cuj-elr="label"
            onClick={handleBodyClick}
            ref={(el) => (labelRef = el)}
          >
            <span data-cuj-elr="label-text">{props.name}</span>
            <Show when={props.trailingLabel}>
              <span data-cuj-elr="trailing-label">{props.trailingLabel!()}</span>
            </Show>
          </button>
        }
      >
        <input
          type="text"
          data-cuj-elr="rename-input"
          aria-label={props.renameAriaLabel ?? `Rename ${props.name}`}
          value={renameValue()}
          disabled={savePending()}
          aria-busy={savePending() ? 'true' : undefined}
          onInput={(e) => setRenameValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commitRename(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              cancelRename();
            }
          }}
          onBlur={() => void commitRename(false)}
          ref={(el) => (inputRef = el)}
          data-no-drag
        />
      </Show>

      <Show when={props.onRename && !renaming()}>
        <button
          type="button"
          data-cuj-elr="icon-btn"
          title="Rename"
          aria-label={props.renameAriaLabel ?? `Rename ${props.name}`}
          disabled={props.busy?.()}
          onClick={(e) => {
            e.stopPropagation();
            startRename();
          }}
          data-no-drag
        >
          <PencilIcon size={12} />
        </button>
      </Show>

      <Show when={props.onDelete && !renaming()}>
        <button
          type="button"
          data-cuj-elr="icon-btn"
          data-variant="danger"
          title="Delete"
          aria-label={props.deleteAriaLabel ?? `Delete ${props.name}`}
          disabled={props.deleteDisabled || props.busy?.() || deletePending()}
          ref={(el) => (trashRef = el)}
          onClick={(e) => {
            e.stopPropagation();
            void handleDelete();
          }}
          data-no-drag
        >
          <Trash2Icon size={12} />
        </button>
      </Show>
    </div>
  );
}
