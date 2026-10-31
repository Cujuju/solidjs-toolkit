import type { JSX } from 'solid-js';

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
  /** Pencil rename trigger. Enter saves, Escape cancels, blur saves. On reject the row stays in
   *  rename mode with the typed value; a blur refused while `busy()` commits once busy clears. */
  onRename?: (next: string) => Promise<void>;
  /** Trash icon. Click → `confirmDelete` → `onDelete`; rejections are swallowed, so surface
   *  errors yourself. `busy()` is checked before the confirm opens. */
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
  /** When `() => true`, the row dims and new interactions are blocked; a confirmed delete
   *  and a busy-deferred blur commit still complete. */
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
  /** ARIA label override for the rename button and rename input
   *  (default: `Rename ${name}`). */
  renameAriaLabel?: string;
  /** ARIA label override for the delete button (default: `Delete ${name}`). */
  deleteAriaLabel?: string;
  /** Edge-triggered (false → true) rename entry from outside. Pair with `onRenameClose` to clear
   *  the driving signal. An edge refused while `busy()` stays latched until busy clears. */
  pendingRename?: () => boolean;
  /** Notification fired when the row EXITS rename mode for any reason
   *  (commit, Escape-cancel, blur-empty-cancel). Pair with `pendingRename`. */
  onRenameClose?: () => void;
  /** Custom confirm-dialog handler invoked before `onDelete`. When omitted,
   *  the library falls back to `window.confirm(message)`. */
  confirmDelete?: (params: ConfirmDeleteParams) => Promise<boolean>;
}

