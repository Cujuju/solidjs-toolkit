import type { AnchoredPlacement } from '@cujuju/solidjs-anchored-popover';
import type { ConfirmDeleteParams, SelectionMode } from '@cujuju/solidjs-editable-list-row';
import type { Accessor, JSX } from 'solid-js';

type HTMLDivAttrs = JSX.HTMLAttributes<HTMLDivElement>;

/** Per-item override config returned by `itemConfig(item)`. All fields
 *  are optional — anything you don't set falls through to the row's
 *  default behavior. */
export interface EditableListFlyoutItemConfig {
  leadingIcon?: () => JSX.Element;
  leadingControl?: () => JSX.Element;
  trailingLabel?: () => JSX.Element;
  selection?: SelectionMode;
  /** Marks the row as the current/selected entry (selection rail). */
  active?: boolean;
  deleteDisabled?: boolean;
  busy?: () => boolean;
  infoTooltip?: string;
  reorderProps?: Record<string, unknown>;
  deleteConfirmTitle?: string;
  deleteConfirmMessage?: string;
  renameAriaLabel?: string;
  deleteAriaLabel?: string;
  pendingRename?: () => boolean;
  onRenameClose?: () => void;
  /** Per-item override; when set, this row's body click invokes this
   *  callback. When absent, the flyout's `onActivate(item)` is used. */
  onActivate?: () => void;
  /** Suppress the rename affordance on this row even when flyout-level `onRename` is wired —
   *  e.g. a pinned built-in entry. Default false. */
  disableRename?: boolean;
  /** When true, suppress the delete affordance on this specific row
   *  even when flyout-level `onDelete` is wired. Same rationale as
   *  `disableRename`. Default false. */
  disableDelete?: boolean;
}

export interface EditableListFlyoutProps<TItem extends { id: string; name: string }> {
  /** Reactive open  */
  open: Accessor<boolean>;
  /** Anchor element accessor (drives positioning). */
  anchor: Accessor<HTMLElement | null | undefined>;
  /** Fires on outside-pointerdown / Escape. */
  onDismiss: () => void;
  /** Placement passed to AnchoredPopover. Default `below-start`. */
  placement?: AnchoredPlacement;
  /** Forwarded to AnchoredPopover. See its docstring. */
  shouldSuppressDismiss?: (target: Element) => boolean;
  /** Class applied to the popover content panel. */
  class?: string;
  /** ARIA role on the popover panel. Common: `"listbox"` / `"dialog"`. */
  role?: HTMLDivAttrs['role'];
  /** ARIA label on the popover panel. */
  'aria-label'?: string;
  /** Source array of items. Each item must have `id` (stable key) and
   *  `name` (display label). Extend the type for whatever extra fields
   *  your callbacks need access to. */
  items: TItem[];
  /** Per-item config override (icons, selection mode, busy, etc.). */
  itemConfig?: (item: TItem) => EditableListFlyoutItemConfig;
  /** Body-click on a row → fires this with the matching item. Per-item
   *  override available via `itemConfig.onActivate`. */
  onActivate?: (item: TItem) => void;
  /** Inline rename commit. Reject keeps the row in rename. */
  onRename?: (item: TItem, name: string) => Promise<void>;
  /** Delete commit (after `confirmDelete` resolves true). */
  onDelete?: (item: TItem) => Promise<void>;
  /** Renders a footer "+ New X": button morphs to input; Enter commits, Escape or blur-empty
   *  cancels, blur-with-value commits. Reject keeps the typed value. */
  onCreate?: (name: string) => Promise<void>;
  /** Footer add button label. Default `"New"`. A leading `+` is dropped: the button draws its own. */
  createButtonLabel?: string;
  /** Footer add input placeholder. Default `"Name…"`. */
  createPlaceholder?: string;
  /** Override the row delete-confirm dialog. */
  confirmDelete?: (params: ConfirmDeleteParams) => Promise<boolean>;
  /** Placeholder text when `items` is empty. Renders inside the panel
   *  above the (optional) add affordance. Omit to render nothing. */
  emptyMessage?: string;
}

