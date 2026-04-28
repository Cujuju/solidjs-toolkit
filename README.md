# solidjs-toolkit

Monorepo for Cujuju's SolidJS UI primitives. Each package publishes to npm under the `@cujuju/` scope.

## Packages

| Package | Summary |
|---|---|
| [`@cujuju/solidjs-hooks`](packages/hooks) | General-purpose Solid hooks — `useMediaQuery`, `useDebouncedCallback`, `useClickOutside`, `useLocalStorage`, etc. |
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

Each package declares `solid-js >=1.7.0` as a peer dependency.

## Develop

```sh
pnpm install
pnpm -r build
pnpm -r test
```

See [`packages/_shared/CONTRIBUTING.md`](packages/_shared/CONTRIBUTING.md) for package conventions.

## License

MIT
