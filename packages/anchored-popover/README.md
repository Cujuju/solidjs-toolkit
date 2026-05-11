# @cujuju/solidjs-anchored-popover

Anchored popover primitive for SolidJS. Uses the HTML Popover API in manual
mode, with a custom outside-click dismiss that excludes the anchor from
"outside" — so clicking the trigger toggles cleanly without racing the UA's
light-dismiss handler.

## Install

```sh
pnpm add @cujuju/solidjs-anchored-popover @cujuju/solidjs-hooks
```

Peer dependencies: `solid-js >= 1.7.0`, `@cujuju/solidjs-hooks ^2.0.0`.

## Usage

```tsx
import { createSignal } from 'solid-js';
import AnchoredPopover from '@cujuju/solidjs-anchored-popover';

function Example() {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();

  return (
    <>
      <button ref={setAnchor} onClick={() => setOpen((o) => !o)}>
        Open
      </button>
      <AnchoredPopover
        open={open}
        anchor={anchor}
        onDismiss={() => setOpen(false)}
        placement="below-start"
        class="my-popover"
        role="menu"
        aria-label="My menu"
      >
        <div>Menu items go here</div>
      </AnchoredPopover>
    </>
  );
}
```

## Props

| Prop | Type | Description |
|---|---|---|
| `open` | `Accessor<boolean>` | Reactive open state. |
| `anchor` | `Accessor<HTMLElement \| null \| undefined>` | Element to anchor against. Excluded from outside-click dismiss. |
| `onDismiss` | `() => void` | Fires on outside pointerdown or Escape. |
| `placement` | `AnchoredPlacement` | One of `below-start`, `below-end`, `above-start`, `above-end`, `right-start`, `right-end`, `left-start`, `left-end`. Default `below-start`. |
| `offsetPx` | `number` | Gap between anchor and popover edge. Default 4. |
| `viewportMarginPx` | `number` | Min gap between popover and viewport edge after clamp. Default 8. |
| `class` | `string` | Class applied to the content element. |
| `role` | `string` | ARIA role on the content element. |
| `aria-label` | `string` | ARIA label on the content element. |
| `id` | `string` | id on the content element. |
| `shellClass` | `string` | Class applied to the SHELL (the `[popover]` element). For `::backdrop` styles only — do NOT use for layout. |
| `shellStyle` | `Accessor<Record<string, string>>` | Inline styles applied to the shell. Useful for CSS vars that need shell scope. Diff-cleared on key removal. |
| `centered` | `boolean` | Center popover horizontally in viewport (vertical placements only). |
| `horizontalAnchor` | `Accessor<HTMLElement>` | Secondary anchor for the side axis (right/left placements). Excluded from dismiss too. |
| `parentPopoverRef` | `Accessor<HTMLElement>` | Parent popover to re-promote after our show (for nested popovers). |
| `shouldSuppressDismiss` | `(target: Element) => boolean` | Predicate consulted on every outside click. Return true to suppress dismiss (e.g. for Portal'd nested popovers). |

## Two-element shape

The popover renders as a SHELL (`[popover="manual"]`, no author class) wrapping
a CONTENT element (carries `class`, `role`, `aria-label`, `id`). This separation
is load-bearing: the UA's `[popover]:not(:popover-open) { display: none }`
rule wins on the shell because no author CSS competes. An author class on the
shell with `display: flex` would defeat closed-state hiding (the cascade trap).

Pass `shellClass` only for `::backdrop` styles and shell-scoped CSS variables.

## Nested popovers (parent/child)

For a popover hosted inside another popover (e.g. a submenu inside a menu, or
a side panel that lives inside an outer flyout), wire the relationship:

```tsx
<AnchoredPopover
  open={subOpen}
  anchor={triggerRow}
  horizontalAnchor={parentPanelEl}
  parentPopoverRef={parentShellEl}
  placement="right-start"
  offsetPx={-3}   // negative under-tucks the child under the parent's edge
  shouldSuppressDismiss={(t) => !!t.closest('[data-my-popover-stack]')}
>
  ...
</AnchoredPopover>
```

`shouldSuppressDismiss` handles dismiss coordination across sibling Portal'd
surfaces — when the user clicks something logically owned by another popover
but Portal'd elsewhere in the DOM tree.

## License

MIT
