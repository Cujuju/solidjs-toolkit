import { Show, createSignal, createEffect, type JSX } from 'solid-js';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { PencilIcon, Trash2Icon, GripVerticalIcon } from './_internal/icons';

export type SelectionMode =
  | { kind: 'none' }
  | { kind: 'checkbox'; checked: boolean; disabled?: boolean; onToggle: (next: boolean) => void };

export interface ConfirmDeleteParams {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger';
}

export interface EditableListRowProps {
  /** Stable id; used for accessibility labels and (downstream) reorder keying. */
  id: string;
  /** Display name of the row. */
  name: string;
  /** Selection-affordance variant. */
  selection: SelectionMode;
  /** Body-click handler. When provided, click-on-name invokes this and the
   *  inline-rename input does NOT auto-open from a body click. When absent
   *  AND `onRename` is provided, body-click enters rename mode. */
  onActivate?: () => void;
  /** When provided, a pencil icon shows as an explicit rename trigger.
   *  Inline rename: Enter saves, Escape cancels, blur saves. On reject the
   *  row STAYS in rename mode with the typed value preserved. */
  onRename?: (next: string) => Promise<void>;
  /** When provided, a trash icon shows. Click trash → `confirmDelete` →
   *  `onDelete`. */
  onDelete?: () => Promise<void>;
  /** Active-state styling. */
  active?: boolean;
  /** Disable just the delete button (e.g. last item in a list). */
  deleteDisabled?: boolean;
  /** Right-aligned content inside the label (e.g. a badge). */
  trailingLabel?: () => JSX.Element;
  /** Left-side passive icon slot (decorative). Mutually exclusive with
   *  `leadingControl` — at most one renders; `leadingControl` wins. */
  leadingIcon?: () => JSX.Element;
  /** Left-side interactive slot (button, toggle, etc.). Consumer owns
   *  visual styling. Wins over `leadingIcon` when both are passed. */
  leadingControl?: () => JSX.Element;
  /** When `() => true`, the row dims and all interactions are blocked. */
  busy?: () => boolean;
  /** Right-click handler. */
  onContextMenu?: (e: MouseEvent) => void;
  /** Spreadable props from a reorder library (e.g. `@cujuju/solid-reorder-list`
   *  itemProps). When present, a drag handle renders on the left. */
  reorderProps?: Record<string, unknown>;
  /** Tooltip text for the row container. */
  infoTooltip?: string;
  /** Override the delete-confirm dialog title (default: "Delete"). */
  deleteConfirmTitle?: string;
  /** Override the delete-confirm dialog body (default: `Delete "${name}"?`). */
  deleteConfirmMessage?: string;
  /** ARIA label override for the rename button (default: `Rename ${name}`). */
  renameAriaLabel?: string;
  /** ARIA label override for the delete button (default: `Delete ${name}`). */
  deleteAriaLabel?: string;
  /** Reactive trigger to enter rename mode from OUTSIDE the row. Edge-
   *  triggered: a false → true transition starts rename. The consumer
   *  should pair this with `onRenameClose` so they can clear whatever
   *  signal drove the initial enter (otherwise the next enter cycle for
   *  the same row won't fire). */
  pendingRename?: () => boolean;
  /** Notification fired when the row EXITS rename mode for any reason
   *  (commit, Escape-cancel, blur-empty-cancel). Pair with `pendingRename`. */
  onRenameClose?: () => void;
  /** Custom confirm-dialog handler invoked before `onDelete`. When omitted,
   *  the library falls back to `window.confirm(message)`. */
  confirmDelete?: (params: ConfirmDeleteParams) => Promise<boolean>;
}

export default function EditableListRow(props: EditableListRowProps): JSX.Element {
  const [renaming, setRenaming] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal('');
  // savePending gates the input + commit path while an in-flight onRename
  // promise is resolving. Distinct from the consumer's busy() (which blocks
  // all interaction). On rejection the row stays in rename mode with the
  // typed value intact; the consumer is responsible for surfacing the error
  // message.
  const [savePending, setSavePending] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  const afterPaint = createAfterPaint();

  function startRename(): void {
    if (props.busy?.() || !props.onRename) return;
    setRenameValue(props.name);
    setRenaming(true);
  }

  async function commitRename(): Promise<void> {
    const trimmed = renameValue().trim();
    if (!trimmed || trimmed === props.name || !props.onRename) {
      // No-op exits — close immediately, no callback.
      setRenaming(false);
      props.onRenameClose?.();
      return;
    }
    if (savePending()) return;
    setSavePending(true);
    try {
      await props.onRename(trimmed);
      setRenaming(false);
      props.onRenameClose?.();
    } catch {
      // Reject: STAY in rename mode with the typed value preserved so
      // the user can fix + retry. Don't fire onRenameClose — the row
      // hasn't actually exited.
    } finally {
      setSavePending(false);
    }
  }

  function cancelRename(): void {
    setRenaming(false);
    props.onRenameClose?.();
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
    if (props.busy?.() || !props.onDelete) return;
    const ok = await confirmDeleteWith();
    if (!ok) return;
    await props.onDelete();
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

  // Auto-focus + select on entering rename mode.
  createEffect(() => {
    if (renaming() && inputRef) {
      afterPaint(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  });

  // External trigger to enter rename mode. Edge-triggered (false → true
  // transitions only) so a parent that holds the signal true longer
  // than one tick doesn't re-trigger after the user cancels via Escape.
  let lastPending = false;
  createEffect(() => {
    const pending = props.pendingRename?.() ?? false;
    if (pending && !lastPending && !renaming() && props.onRename) {
      startRename();
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
        <span data-cuj-elr="leading-control">
          {props.leadingControl!()}
        </span>
      </Show>

      <Show when={props.selection.kind === 'checkbox'}>
        {(() => {
          const sel = props.selection as Extract<SelectionMode, { kind: 'checkbox' }>;
          return (
            <input
              type="checkbox"
              data-cuj-elr="checkbox"
              checked={sel.checked}
              disabled={sel.disabled || props.busy?.()}
              onChange={(e) => sel.onToggle(e.currentTarget.checked)}
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
          value={renameValue()}
          disabled={savePending()}
          aria-busy={savePending() ? 'true' : undefined}
          onInput={(e) => setRenameValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commitRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              cancelRename();
            }
          }}
          onBlur={() => void commitRename()}
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
          disabled={props.deleteDisabled || props.busy?.()}
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
