# @cujuju/solidjs-hold-action

Press-and-hold primitive for SolidJS. Pair the `useHoldAction` hook (timing + event handlers + progress signal) with the `<HoldIndicator>` component (SVG ring / rectangle border trace / linear bar) for hold-to-confirm UX.

## Install

```
pnpm add @cujuju/solidjs-hold-action
```

No stylesheet — `<HoldIndicator>` uses inline SVG with `currentColor` by default.

## Usage

```tsx
import { useHoldAction, HoldIndicator } from '@cujuju/solidjs-hold-action';

function DeleteButton() {
  const hold = useHoldAction({
    durationMs: 1500,
    onComplete: () => performDelete(),
  });
  return (
    <button
      {...hold.handlers}
      style={{ position: 'relative', color: 'red' }}
      title="Hold to delete"
    >
      <Icon name="trash-2" />
      <Show when={hold.holding()}>
        <HoldIndicator progress={hold.progress} shape="rect" />
      </Show>
    </button>
  );
}
```

## `useHoldAction(options)`

| Option | Default | Description |
|---|---|---|
| `durationMs` | (required) | Duration to complete. Intentionally has no default — pick per context (250ms for confirmations, 1500-2000ms for destructive). |
| `onComplete` | (required) | Called once when progress reaches 1. |
| `onProgress(p)` | — | RAF-tick callback with progress 0→1. Use for custom visuals that need per-frame access. |
| `stages` | — | Array of `{ at: ms, onReach }` intermediate callbacks. Each fires once per hold when its `at` ms is crossed. Not re-fired if the hold cancels. |
| `trigger` | `'press'` | `'press'` = pointerdown starts, pointerup stops. `'hover'` = pointerenter starts, pointerleave stops. |
| `enabled` | `() => true` | Accessor; when false, holds do not start. |
| `onCancel` | — | Called when an in-progress hold is cancelled (pointerup, pointerleave, doc-mouseup, pointercancel, or imperative `cancel()`). Does NOT fire after `onComplete`, and does NOT fire on component cleanup. Use for reverting visual state set during the hold. |
| `suppressClickAfterComplete` | `true` | Lets `shouldSuppressClick()` report the `click` that follows a completed hold, so your `onClick` can swallow it (prevents double-firing). Nothing is suppressed unless your `onClick` calls it — see [Suppression details](#suppression-details). |
| `cancelOnLeave` | `true` | Pointer leaving the element cancels. `pointercancel` (the platform taking the pointer, e.g. a touch pan) always cancels, regardless of this. |
| `cancelOnDocumentMouseUp` | `true` | Mouse up anywhere on the document cancels an in-progress hold (catches release outside the element). |

### Returns

```ts
{
  handlers: {
    onPointerDown, onPointerUp, onPointerEnter, onPointerLeave, onPointerCancel
  },                           // spread onto the target element
  progress: Accessor<number>,  // 0 → 1
  holding: Accessor<boolean>,
  shouldSuppressClick: () => boolean, // one-shot; call from your onClick
  cancel: () => void,
}
```

## `<HoldIndicator>`

| Prop | Default | Description |
|---|---|---|
| `progress` | (required) | Accessor or plain number 0→1. |
| `shape` | `'circle'` | `'circle'` / `'rect'` / `'bar'`. |
| `width`, `height`, `size` | — | Raw sizing. `size` is shorthand for square. |
| `fillParent` | `true` when no explicit size | Positions absolutely inside a `position: relative` parent with `inset: 0`. |
| `stroke` | `'currentColor'` | Path color. |
| `strokeWidth` | `2` | In px. |
| `strokeLinecap` | `'round'` (circle, bar), `'square'` (rect) | |
| `easing` | — | Optional `(t: number) => number` curve applied to progress before geometry is computed. Output is clamped to `[0, 1]`, so overshoot easings won't break geometry. Default is linear (no transform). Examples: ease-in `t => t*t`, ease-out `t => 1 - Math.pow(1-t, 3)`. |
| `radius` | `6` | Corner radius for `shape="rect"`. |
| `startAngle` | `0` (top) | Circle only — offset in degrees. |
| `direction` | `'clockwise'` | |
| `class`, `style` | — | Passthrough. |

The component measures its parent (or self, when explicit size) via `offsetWidth`/`offsetHeight` + `ResizeObserver` for correct geometry. Those are layout dimensions, so a CSS `transform` on an ancestor is not double-applied to the SVG.

## Multi-stage holds

```tsx
const hold = useHoldAction({
  durationMs: 3000,
  onComplete: () => finalAction(),
  stages: [
    { at: 1000, onReach: () => navigator.vibrate?.(10) },
    { at: 2000, onReach: () => navigator.vibrate?.([20, 20, 20]) },
  ],
});
```

## Hover trigger

```tsx
const hold = useHoldAction({
  durationMs: 800,
  trigger: 'hover',
  onComplete: () => openFlyout(),
});
return (
  <div onPointerEnter={hold.handlers.onPointerEnter} onPointerLeave={hold.handlers.onPointerLeave}>
    …
  </div>
);
```

## Suppression details

The `click` event fires AFTER `pointerup` (touch: `pointerup` → `pointerleave` → `click`). Without suppression, a completed hold would also fire the element's `onClick` (e.g., opening a popover). `handlers` has no `onClick`: call `shouldSuppressClick()` from your own. It returns `true` once after a completed hold (when `suppressClickAfterComplete` is `true`, the default), then `false`. Tap-without-holding still fires onClick normally.

```tsx
const onClick = (e: MouseEvent) => {
  if (hold.shouldSuppressClick()) { e.preventDefault(); return; }
  openPopover();
};
return <button {...hold.handlers} onClick={onClick}>…</button>;
```

If the release after a completed hold lands off the element, no click follows and the flag stays set until the next hold starts — the next click on the element (including a keyboard click) is then swallowed.

## Future ideas

- Keyboard support (Space/Enter held) — deferred pending accessibility review for destructive actions
- Touch-specific duration presets
- Haptic feedback integration

## License

MIT
