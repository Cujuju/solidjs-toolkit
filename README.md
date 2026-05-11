# solidjs-toolkit

Monorepo for Cujuju's SolidJS UI primitives. Each package publishes to npm under the `@cujuju/` scope.

## Packages

| Package | Summary |
|---|---|
| [`@cujuju/solidjs-hooks`](packages/hooks) | General-purpose Solid hooks — `createClickOutside`, `createEscapeKey`, `createHotkey`, `createLocalStorage`, `createMediaQuery`, `createDebounce`, `createAfterPaint`, `createOutsideScrollDismiss`, observers, persisted Set/Map, async status. **v2.0.0**: renamed all hooks `use*` → `create*` to match SolidJS idiom. |
| [`@cujuju/solidjs-anchored-popover`](packages/anchored-popover) | Anchored popover primitive — HTML Popover API in manual mode, 8 placements, viewport clamping, parent/child popover coordination, wireable dismiss-skip predicate — `AnchoredPopover`. |
| [`@cujuju/solidjs-editable-list-row`](packages/editable-list-row) | Editable list row primitive — inline rename, delete-with-confirm, selection variants, drag-reorder pass-through, leading icon/control slot — `EditableListRow`. |
| [`@cujuju/solidjs-editable-list-flyout`](packages/editable-list-flyout) | Composed flyout primitive — anchored popover wrapping editable rows with built-in inline-add affordance + per-row rename/delete opt-out — `EditableListFlyout`. |
| [`@cujuju/solidjs-seg-buttons`](packages/seg-buttons) | Segmented button group — `SegGroup`, `SegButton`. |
| [`@cujuju/solidjs-pill-toggle`](packages/pill-toggle) | iOS-style pill toggle — `PillToggle`. |
| [`@cujuju/solidjs-pill-number-picker`](packages/pill-number-picker) | Pill-shaped numeric input — `PillNumberPicker`. |
| [`@cujuju/solidjs-kv-tooltip`](packages/kv-tooltip) | Key/value tooltip with hover-intent — `KvTooltip`, `KvTooltipPanel`. |
| [`@cujuju/solidjs-hold-action`](packages/hold-action) | Press-and-hold primitive — `useHoldAction`, `HoldIndicator`. |
| [`@cujuju/solidjs-collapsible`](packages/collapsible) | Animated collapse/expand — `Collapsible`. |

## Install (consumer)

```sh
pnpm add @cujuju/solidjs-pill-toggle
```

Each package declares `solid-js >=1.7.0` as a peer dependency. `anchored-popover`, `editable-list-row`, and `editable-list-flyout` additionally peer-depend on `@cujuju/solidjs-hooks ^2.0.0`.

## Develop

```sh
pnpm install
pnpm -r build
pnpm -r test
```

See [`packages/_shared/CONTRIBUTING.md`](packages/_shared/CONTRIBUTING.md) for package conventions.

## License

MIT
