import { Show, For, createMemo, createSignal, untrack, type Accessor, type JSX } from 'solid-js';
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
  /** Renders a footer "+ New X": button morphs to input; Enter commits, Escape or blur-empty
   *  cancels, blur-with-value commits. Reject keeps the typed value. */
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
 * Anchored popover over EditableListRow entries with an optional footer add affordance.
 * `itemConfig(item)` keeps `items` lean (`{ id, name }`) while attaching per-row icons,
 * selection and busy state.
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
  let addButtonRef: HTMLButtonElement | undefined;
  const afterPaint = createAfterPaint();

  function startCreating(): void {
    setCreateValue('');
    setCreating(true);
    afterPaint(() => createInputRef?.focus());
  }

  // Keyboard exits (Escape/Enter) unmount the focused input; hand focus back
  // to the add button. Blur exits already moved focus elsewhere — leave it.
  function inputOwnsFocus(): boolean {
    return createInputRef !== undefined && document.activeElement === createInputRef;
  }

  // After an await the user may have moved focus; restore only if it stayed on the input or dropped to <body>.
  function focusStayedOrDropped(): boolean {
    const active = document.activeElement;
    return active === null || active === document.body || active === createInputRef;
  }

  function cancelCreate(): void {
    const restoreFocus = inputOwnsFocus();
    // Clear before unmounting: removing the focused input fires blur synchronously,
    // and onBlur must see an empty value or it commits.
    setCreateValue('');
    setCreating(false);
    if (restoreFocus) addButtonRef?.focus();
  }

  async function commitCreate(): Promise<void> {
    const restoreFocus = inputOwnsFocus();
    const name = createValue().trim();
    if (!name) {
      cancelCreate();
      return;
    }
    if (pending() || !props.onCreate) return;
    setPending(true);
    try {
      await props.onCreate(name);
      const restore = restoreFocus && focusStayedOrDropped();
      setCreateValue('');
      setCreating(false);
      if (restore) addButtonRef?.focus();
    } catch {
      // Reject: keep input open with typed value so consumer can show
      // toast and let user retry / amend.
      // Disabling the focused input dropped focus; return it once re-enabled.
      if (restoreFocus) {
        afterPaint(() => {
          if (focusStayedOrDropped()) createInputRef?.focus();
        });
      }
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
              // <For> runs this factory untracked; the memo re-runs itemConfig
              // when signals it reads change, and each prop getter tracks it.
              const cfg = createMemo(() => props.itemConfig?.(item) ?? {});
              const leadingIcon = stableSlot(cfg, (c) => c.leadingIcon);
              const leadingControl = stableSlot(cfg, (c) => c.leadingControl);
              const trailingLabel = stableSlot(cfg, (c) => c.trailingLabel);
              return (
                <div role="listitem">
                  <EditableListRow
                    id={item.id}
                    name={item.name}
                    selection={cfg().selection ?? { kind: 'none' }}
                    active={cfg().active}
                    onActivate={
                      cfg().onActivate || props.onActivate
                        ? () => handleRowActivate(item, cfg().onActivate)
                        : undefined
                    }
                    onRename={
                      props.onRename && !cfg().disableRename
                        ? (next) => props.onRename!(item, next)
                        : undefined
                    }
                    onDelete={
                      props.onDelete && !cfg().disableDelete
                        ? () => props.onDelete!(item)
                        : undefined
                    }
                    leadingIcon={leadingIcon()}
                    leadingControl={leadingControl()}
                    trailingLabel={trailingLabel()}
                    deleteDisabled={cfg().deleteDisabled}
                    busy={cfg().busy}
                    infoTooltip={cfg().infoTooltip}
                    reorderProps={cfg().reorderProps}
                    deleteConfirmTitle={cfg().deleteConfirmTitle}
                    deleteConfirmMessage={cfg().deleteConfirmMessage}
                    renameAriaLabel={cfg().renameAriaLabel}
                    deleteAriaLabel={cfg().deleteAriaLabel}
                    pendingRename={cfg().pendingRename}
                    onRenameClose={cfg().onRenameClose}
                    confirmDelete={props.confirmDelete}
                  />
                </div>
              );
            }}
          </For>
        </div>

        <Show when={props.onCreate}>
          <Show
            when={creating()}
            fallback={
              <button
                ref={(el) => (addButtonRef = el)}
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

type SlotRender = () => JSX.Element;

/** Referentially stable slot renderer: the row re-mounts a slot only when it
 *  appears or disappears, not on every itemConfig re-run. */
function stableSlot(
  cfg: Accessor<EditableListFlyoutItemConfig>,
  pick: (config: EditableListFlyoutItemConfig) => SlotRender | undefined,
): Accessor<SlotRender | undefined> {
  const present = createMemo(() => pick(cfg()) !== undefined);
  // Untrack only the config read; reads inside the slot function stay tracked by the row.
  const render: SlotRender = () => pick(untrack(cfg))?.();
  return () => (present() ? render : undefined);
}

function joinClass(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
