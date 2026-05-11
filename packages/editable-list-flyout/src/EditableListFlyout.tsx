import { Show, For, createSignal, type Accessor, type JSX } from 'solid-js';
import AnchoredPopover, {
  type AnchoredPlacement,
} from '@cujuju/solidjs-anchored-popover';
import EditableListRow, {
  type SelectionMode,
  type ConfirmDeleteParams,
} from '@cujuju/solidjs-editable-list-row';
import { createAfterPaint } from '@cujuju/solidjs-hooks';

type HTMLDivAttrs = JSX.HTMLAttributes<HTMLDivElement>;

/** Per-item override config returned by `itemConfig(item)`. All fields
 *  are optional — anything you don't set falls through to the row's
 *  default behavior. */
export interface EditableListFlyoutItemConfig {
  leadingIcon?: () => JSX.Element;
  leadingControl?: () => JSX.Element;
  trailingLabel?: () => JSX.Element;
  selection?: SelectionMode;
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
  /** When true, suppress the rename affordance on this specific row
   *  even when flyout-level `onRename` is wired. Use for non-editable
   *  rows that share the list with editable peers — e.g. a pinned
   *  built-in entry that the user activates but cannot rename.
   *  Default false. */
  disableRename?: boolean;
  /** When true, suppress the delete affordance on this specific row
   *  even when flyout-level `onDelete` is wired. Same rationale as
   *  `disableRename`. Default false. */
  disableDelete?: boolean;
}

export interface EditableListFlyoutProps<TItem extends { id: string; name: string }> {
  /** Reactive open state. */
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
  /** When provided, a footer "+ New X" affordance renders. Button
   *  morphs to input on click; Enter commits, Escape cancels, blur-
   *  empty cancels, blur-with-value commits. Reject keeps the input
   *  open with the typed value. */
  onCreate?: (name: string) => Promise<void>;
  /** Footer add button label. Default `"+ New"`. */
  createButtonLabel?: string;
  /** Footer add input placeholder. Default `"Name…"`. */
  createPlaceholder?: string;
  /** Override the row delete-confirm dialog. */
  confirmDelete?: (params: ConfirmDeleteParams) => Promise<boolean>;
  /** Placeholder text when `items` is empty. Renders inside the panel
   *  above the (optional) add affordance. Omit to render nothing. */
  emptyMessage?: string;
}

/**
 * EditableListFlyout — anchored popover wrapping a list of EditableListRow
 * entries with a built-in inline-add affordance at the footer.
 *
 * Three composition layers in one primitive:
 *   1. AnchoredPopover — positioning, dismiss, two-element shell shape.
 *   2. EditableListRow (per item) — inline rename, delete-with-confirm,
 *      selection (none/checkbox), drag handle when reorderProps set.
 *   3. Footer add affordance (when `onCreate` provided) — button morphs
 *      to input with matching geometry; Enter commits, Escape cancels.
 *
 * Per-item configuration via `itemConfig(item)` keeps the items array
 * lean (just `{ id, name }`) while letting consumers attach icons,
 * selection mode, busy gating, reorder props, etc. on a per-row basis.
 */
export default function EditableListFlyout<
  TItem extends { id: string; name: string },
>(props: EditableListFlyoutProps<TItem>): JSX.Element {
  // Inline-create state. `creating()` toggles the bottom row between
  // the button and an input. `pending()` blocks while the onCreate
  // promise is in flight.
  const [creating, setCreating] = createSignal(false);
  const [createValue, setCreateValue] = createSignal('');
  const [pending, setPending] = createSignal(false);
  let createInputRef: HTMLInputElement | undefined;
  const afterPaint = createAfterPaint();

  function startCreating(): void {
    setCreateValue('');
    setCreating(true);
    afterPaint(() => createInputRef?.focus());
  }

  function cancelCreate(): void {
    setCreating(false);
    setCreateValue('');
  }

  async function commitCreate(): Promise<void> {
    const name = createValue().trim();
    if (!name) {
      cancelCreate();
      return;
    }
    if (pending() || !props.onCreate) return;
    setPending(true);
    try {
      await props.onCreate(name);
      setCreating(false);
      setCreateValue('');
    } catch {
      // Reject: keep input open with typed value so consumer can show
      // toast and let user retry / amend.
    } finally {
      setPending(false);
    }
  }

  function handleRowActivate(item: TItem, override: (() => void) | undefined): void {
    if (override) {
      override();
      return;
    }
    props.onActivate?.(item);
  }

  return (
    <AnchoredPopover
      open={props.open}
      anchor={props.anchor}
      onDismiss={props.onDismiss}
      placement={props.placement ?? 'below-start'}
      shouldSuppressDismiss={props.shouldSuppressDismiss}
      role={props.role}
      aria-label={props['aria-label']}
      class={joinClass('cuj-elf-popover', props.class)}
    >
      <div data-cuj-elf="popover">
        <div data-cuj-elf="list" role={props.items.length === 0 ? undefined : 'list'}>
          <Show when={props.items.length === 0 && props.emptyMessage}>
            <div data-cuj-elf="empty">{props.emptyMessage}</div>
          </Show>
          <For each={props.items}>
            {(item) => {
              const cfg = props.itemConfig?.(item) ?? {};
              return (
                <EditableListRow
                  id={item.id}
                  name={item.name}
                  selection={cfg.selection ?? { kind: 'none' }}
                  onActivate={
                    cfg.onActivate || props.onActivate
                      ? () => handleRowActivate(item, cfg.onActivate)
                      : undefined
                  }
                  onRename={
                    props.onRename && !cfg.disableRename
                      ? (next) => props.onRename!(item, next)
                      : undefined
                  }
                  onDelete={
                    props.onDelete && !cfg.disableDelete
                      ? () => props.onDelete!(item)
                      : undefined
                  }
                  leadingIcon={cfg.leadingIcon}
                  leadingControl={cfg.leadingControl}
                  trailingLabel={cfg.trailingLabel}
                  deleteDisabled={cfg.deleteDisabled}
                  busy={cfg.busy}
                  infoTooltip={cfg.infoTooltip}
                  reorderProps={cfg.reorderProps}
                  deleteConfirmTitle={cfg.deleteConfirmTitle}
                  deleteConfirmMessage={cfg.deleteConfirmMessage}
                  renameAriaLabel={cfg.renameAriaLabel}
                  deleteAriaLabel={cfg.deleteAriaLabel}
                  pendingRename={cfg.pendingRename}
                  onRenameClose={cfg.onRenameClose}
                  confirmDelete={props.confirmDelete}
                />
              );
            }}
          </For>
        </div>

        <Show when={props.onCreate}>
          <Show
            when={creating()}
            fallback={
              <button
                type="button"
                data-cuj-elf="add-button"
                onClick={startCreating}
                aria-label={(props.createButtonLabel ?? '+ New').replace(/^\+\s*/, 'New ')}
              >
                <span aria-hidden="true">+</span>
                <span>{props.createButtonLabel ?? 'New'}</span>
              </button>
            }
          >
            <input
              ref={(el) => (createInputRef = el)}
              type="text"
              data-cuj-elf="add-input"
              placeholder={props.createPlaceholder ?? 'Name…'}
              value={createValue()}
              onInput={(e) => setCreateValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commitCreate();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelCreate();
                }
              }}
              onBlur={() => {
                if (createValue().trim() === '') {
                  cancelCreate();
                } else {
                  void commitCreate();
                }
              }}
              disabled={pending()}
              aria-label={props.createPlaceholder ?? 'New item name'}
            />
          </Show>
        </Show>
      </div>
    </AnchoredPopover>
  );
}

function joinClass(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
