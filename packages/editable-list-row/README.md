# @cujuju/solidjs-editable-list-row

Editable list row primitive for SolidJS — inline rename, delete-with-confirm,
selection variants (none / checkbox), leading icon or interactive control slot,
trailing badge slot, drag-reorder library pass-through, busy gating.

## Install

```sh
pnpm add @cujuju/solidjs-editable-list-row @cujuju/solidjs-hooks
```

Peer dependencies: `solid-js >= 1.7.0`, `@cujuju/solidjs-hooks ^2.0.0`.

## Usage

```tsx
import EditableListRow from '@cujuju/solidjs-editable-list-row';

<EditableListRow
  id={collection.id}
  name={collection.name}
  selection={{ kind: 'checkbox', checked: isMember, onToggle }}
  onRename={(next) => updateCollection(collection.id, next)}
  onDelete={() => deleteCollection(collection.id)}
  deleteConfirmTitle="Delete Collection"
  deleteConfirmMessage={`Delete the "${collection.name}" collection?`}
/>
```

## Props

| Prop | Type | Description |
|---|---|---|
| `id` | `string` | Stable id (a11y + reorder keying). |
| `name` | `string` | Display name. |
| `selection` | `{ kind: 'none' } \| { kind: 'checkbox'; checked; onToggle; disabled? }` | Selection-affordance variant. |
| `onActivate?` | `() => void` | Body-click handler. When provided, click-on-name invokes this. |
| `onRename?` | `(next: string) => Promise<void>` | Inline rename commit. Reject keeps row in rename with typed value. |
| `onDelete?` | `() => Promise<void>` | Delete commit. Runs after `confirmDelete` resolves true. |
| `active?` | `boolean` | Active-state styling. |
| `deleteDisabled?` | `boolean` | Disable just the delete button. |
| `trailingLabel?` | `() => JSX.Element` | Right-aligned badge slot inside the label. |
| `leadingIcon?` | `() => JSX.Element` | Decorative left-side icon slot. |
| `leadingControl?` | `() => JSX.Element` | Interactive left-side slot (wins over `leadingIcon`). |
| `busy?` | `() => boolean` | Block all interactions; row dims and sets `aria-busy`. |
| `onContextMenu?` | `(e: MouseEvent) => void` | Right-click handler. |
| `reorderProps?` | `Record<string, unknown>` | Spread from a reorder library (e.g. `@cujuju/solid-reorder-list`). Adds a drag handle. |
| `infoTooltip?` | `string` | Tooltip on the row. |
| `deleteConfirmTitle?` | `string` | Default `"Delete"`. |
| `deleteConfirmMessage?` | `string` | Default `Delete "${name}"?`. |
| `renameAriaLabel?` | `string` | Default `Rename ${name}`. |
| `deleteAriaLabel?` | `string` | Default `Delete ${name}`. |
| `pendingRename?` | `() => boolean` | External edge-triggered rename entry (false → true starts rename). |
| `onRenameClose?` | `() => void` | Fired when rename exits for any reason. Pair with `pendingRename`. |
| `confirmDelete?` | `(params) => Promise<boolean>` | Custom delete-confirm dialog. Default: `window.confirm`. |

## Click semantics

Body-click priority:
1. If `onActivate` is set, invoke it.
2. Else if `selection.kind === 'checkbox'` and not disabled, toggle the checkbox.
3. Else if `onRename` is set, enter rename mode.

The pencil icon is always available as an explicit rename trigger when
`onRename` is set, regardless of selection mode.

## Theming

CSS variables (defaults shown):

```css
[data-cuj-elr] {
  --cuj-elr-bg-active: rgba(59, 130, 246, 0.1);
  --cuj-elr-bg-hover: rgba(59, 130, 246, 0.05);
  --cuj-elr-bg-rename-input: #fff;
  --cuj-elr-border-rename: #3b82f6;
  --cuj-elr-icon-fg: #6b7280;
  --cuj-elr-icon-fg-hover: #111827;
  --cuj-elr-icon-bg-hover: rgba(59, 130, 246, 0.1);
  --cuj-elr-icon-danger-fg: #ef4444;
  --cuj-elr-icon-danger-bg-hover: rgba(239, 68, 68, 0.1);
  --cuj-elr-row-padding-y: 4px;
  --cuj-elr-row-padding-x: 8px;
  --cuj-elr-row-radius: 6px;
  --cuj-elr-label-padding-y: 4px;
  --cuj-elr-label-padding-x: 6px;
  --cuj-elr-label-radius: 4px;
}
```

Override in a consumer scope (e.g. a flyout that uses your app's theme tokens).

## License

MIT
