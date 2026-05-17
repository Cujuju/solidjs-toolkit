# @cujuju/solidjs-glass

Glassmorphism surface system for SolidJS:

- **`.glass-panel` / `.glass-menu`** — two global surface classes plus
  the design tokens that drive them.
- **menu-tint engine** — pure functions that read/write/apply five
  user-tunable knobs to the smoked-glass menu tint.
- **`MenuTintSection`** — a drop-in settings panel exposing the knobs as
  sliders + named presets with a live preview.

## Install

```sh
pnpm add @cujuju/solidjs-glass
```

## Surface classes

Import the stylesheet once, then apply the class:

```ts
import '@cujuju/solidjs-glass/glass.css';
```

```tsx
<div class="glass-panel">translucent content surface</div>
<div class="glass-menu">smoked-glass menu surface</div>
```

Or from a CSS Module: `composes: glass-menu from global;`.

Importing anything from the package entry (`@cujuju/solidjs-glass`)
also registers `glass.css` as a side effect.

### Host tokens

Token defaults ship in `@layer cujuju-defaults`, so a host theme's
unlayered definitions override them. The glass classes read only two
host tokens — both have layered fallbacks, so the package renders
standalone:

| Token | Fallback |
|-------|----------|
| `--color-surface` | `#16213e` |
| `--color-border` | `rgba(255,255,255,0.1)` |

## Menu-tint engine

```ts
import {
  bootstrapMenuTintFromStorage,
  applyMenuTintKnobs,
  type MenuTintKnobs,
} from '@cujuju/solidjs-glass';

// Before the SolidJS root renders, so the first paint has the tint:
bootstrapMenuTintFromStorage();
```

All storage functions accept an optional `storageKey` (default
`solidjs-glass:menuTintKnobs`). Pass your own to namespace it or to
preserve values already stored under a host-specific key.

## MenuTintSection

```tsx
import { MenuTintSection } from '@cujuju/solidjs-glass';

<MenuTintSection />
// or pin the storage key:
<MenuTintSection storageKey="myapp:menuTintKnobs" />
```

`MenuTintSection` is a settings panel for a **themed host**. Beyond the
two glass host tokens above it expects the host to define a standard
theme-token set: `--color-text`, `--color-text-secondary`,
`--color-text-muted`, `--color-text-on-overlay`, `--color-surface`,
`--color-surface-raised`, `--color-surface-hover`, `--color-border`,
`--color-primary`, `--color-primary-alpha-20`, `--font-size-xs`,
`--font-size-sm`, `--font-size-base`, `--font-size-md`, `--radius-xs`,
`--radius-md`, `--radius-btn`, `--radius-xl`, `--height-btn`,
`--transition-speed-fast`. Slider geometry tokens (`--cujuju-mt-*`) have
built-in defaults.

The component side-effect-imports its own stylesheets (`glass.css` +
`menu-tint.css`).

## License

MIT
