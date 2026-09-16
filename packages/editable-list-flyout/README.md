# @cujuju/solidjs-editable-list-flyout

Composed flyout primitive — anchored popover wrapping a list of editable rows
with a built-in inline-add affordance. Drop-in replacement for the
"flyout-select with create / rename / delete" pattern.

## Install

```sh
pnpm add @cujuju/solidjs-editable-list-flyout \
         @cujuju/solidjs-anchored-popover \
         @cujuju/solidjs-editable-list-row \
         @cujuju/solidjs-hooks
```

Peer dependencies: `solid-js >= 1.7.0`, plus the three sibling toolkit
packages.

## Usage

```tsx
import { createSignal } from 'solid-js';
import EditableListFlyout from '@cujuju/solidjs-editable-list-flyout';

function CollectionPicker() {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();

  return (
    <>
      <button ref={setAnchor} onClick={() => setOpen((o) => !o)}>
        Collections
      </button>
      <EditableListFlyout
        open={open}
        anchor={anchor}
        onDismiss={() => setOpen(false)}
        placement="below-end"
        role="dialog"
        aria-label="Add to Collection"
        items={collections()}
        itemConfig={(c) => ({
          selection: {
            kind: 'checkbox',
            checked: isMember(c.id),
            onToggle: (next) => toggleMembership(c.id, next),
          },
        })}
        onRename={(c, name) => renameCollection(c.id, name)}
        onDelete={(c) => deleteCollection(c.id)}
        onCreate={(name) => createCollection(name)}
        createButtonLabel="New Collection"
        createPlaceholder="Collection name…"
      />
    </>
  );
}
```

## Props

| Prop | Type | Description |
|---|---|---|
| `open` | `Accessor<boolean>` | Reactive open state. |
| `anchor` | `Accessor<HTMLElement>` | Element to anchor against. |
| `onDismiss` | `() => void` | Outside-click / Escape handler. |
| `placement` | `AnchoredPlacement` | Default `below-start`. |
| `shouldSuppressDismiss` | `(target: Element) => boolean` | Forwarded to AnchoredPopover. |
| `class` | `string` | Class on the popover content panel. |
| `role` | `string` | ARIA role. |
| `aria-label` | `string` | ARIA label. |
| `items` | `TItem[]` | Items where `TItem extends { id; name }`. |
| `itemConfig` | `(item) => EditableListFlyoutItemConfig` | Per-row overrides. |
| `onActivate` | `(item) => void` | Body-click on a row. |
| `onRename` | `(item, name) => Promise<void>` | Rename commit. Reject keeps row in rename. |
| `onDelete` | `(item) => Promise<void>` | Delete commit. Runs after `confirmDelete`. A rejection is swallowed by the row (surface the error yourself); the trash button stays disabled until it settles. |
| `onCreate` | `(name) => Promise<void>` | Inline-create commit. Reject keeps input. |
| `createButtonLabel` | `string` | Default `"New"`. |
| `createPlaceholder` | `string` | Default `"Name…"`. |
| `confirmDelete` | `(params) => Promise<boolean>` | Override the row delete-confirm. |
| `emptyMessage` | `string` | Placeholder text when items is empty. |

### `EditableListFlyoutItemConfig`

```ts
interface EditableListFlyoutItemConfig {
  leadingIcon?: () => JSX.Element;
  leadingControl?: () => JSX.Element;
  trailingLabel?: () => JSX.Element;
  selection?: SelectionMode;          // { kind: 'none' } | { kind: 'checkbox'; ... }
  active?: boolean;                   // current entry; draws the selection rail
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
  onActivate?: () => void;            // per-row override; wins over flyout-level onActivate
}
```

## Behavior

- Footer add affordance only renders when `onCreate` is provided.
- Button morphs to input on click. Enter commits the trimmed value, Escape
  cancels, blur-empty cancels, blur-with-value commits. Reject keeps the
  input open with the typed value so the consumer can show an error toast
  and let the user retry.
- Delete uses the parent `confirmDelete` prop; rows fall back to
  `window.confirm` if it's omitted.
- `itemConfig(item)` re-runs when signals it reads change, so plain fields
  (`selection`, `active`, `deleteDisabled`, …) stay live. Those re-runs do
  not re-mount slot functions (`leadingIcon`, `leadingControl`,
  `trailingLabel`). A signal read directly in a slot function's body re-runs
  the whole slot and creates new nodes (dropping focus); read signals inside
  its JSX instead. A slot function swapped while the slot is present is
  picked up only when that slot next re-runs, so don't choose between
  functions inside `itemConfig` — branch inside one slot function.

## Styling

The package entry imports `styles.css` (the built bundle also exports
`./style.css`). Defaults are declared
on every `[data-cuj-elf]` element, so an override must match those elements
(e.g. `.my-flyout [data-cuj-elf] { … }` with `class="my-flyout"`); setting a
token on an outer ancestor has no effect.

| Token | Default | Purpose |
|---|---|---|
| `--cuj-elf-popover-bg` | `#1e293b` | Panel background. |
| `--cuj-elf-popover-fg` | `#e2e8f0` | Panel text, inherited by row labels and inputs. **Override it together with `-popover-bg`.** |
| `--cuj-elf-popover-border` / `-radius` / `-shadow` / `-padding` | see styles.css | Panel chrome. |
| `--cuj-elf-popover-min-width` / `-max-height` | `220px` / `60vh` | Panel size; the list scrolls past max height. |
| `--cuj-elf-rail-width` / `--cuj-elf-rail-color` | `3px` / `#3b82f6` | Selection rail on `active` rows. |
| `--cuj-elf-list-gap` | `2px` | Gap between rows. |
| `--cuj-elf-footer-fg` / `-fg-hover` | `#94a3b8` / `#e2e8f0` | Add button and empty-message text. |
| `--cuj-elf-footer-*` (bg, border, input, spacing) | see styles.css | Add button / input geometry and fill. |
| `--cuj-elf-scrollbar-thumb` / `-thumb-hover` | translucent white | List scrollbar thumb. |

## License

MIT
