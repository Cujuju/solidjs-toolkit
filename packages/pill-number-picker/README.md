# @cujuju/solidjs-pill-number-picker

Compact number stepper for SolidJS. 8 layouts (horizontal + vertical). Optional collapse-to-value with a portalled pop-out. Auto-repeat with optional acceleration. Full spinbutton a11y. RTL-ready via CSS logical properties.

## Install

```
pnpm add @cujuju/solidjs-pill-number-picker
```

Stylesheet auto-imports; or import `@cujuju/solidjs-pill-number-picker/styles.css` manually.

## Usage

```tsx
import { PillNumberPicker } from '@cujuju/solidjs-pill-number-picker';

const [qty, setQty] = createSignal(1);

<PillNumberPicker
  value={qty()}
  onChange={setQty}
  min={1}
  max={10}
  ariaLabel="Quantity"
/>
```

## API (highlights)

| Prop | Default | Description |
|---|---|---|
| `value` | (required) | Controlled current value. |
| `onChange(v)` | (required) | Called on any change. |
| `min`, `max`, `step` | `1`, `100`, `1` | Range + step size. `step` may be non-integer (e.g., `0.5`, `0.01`). |
| `precision` | (inferred from `step`) | Decimal places for parsing, step rounding, and display. Auto-inferred from `step` (so `step={0.5}` gives precision 1). Set explicitly to override — e.g. `step={1}, precision={2}` for integer steps with two-decimal display ('5.00'). Set to 0 to force integer mode regardless of step. |
| `size` | `'md'` | `'xs'` / `'sm'` / `'md'`. |
| `width`, `height`, `buttonWidth`, `fontSize` | (preset) | Raw overrides. |
| `layout` | `'value-inc-dec'` | See layout table below. |
| `collapsible` | `false` | Collapse to the value alone; reveal the buttons in a pop-out on demand. See below. |
| `open`, `onOpenChange` | (uncontrolled) | Controlled pop-out state. Omit `open` to let the component own it. |
| `popoutGap` | `4` | px between the collapsed value and the pop-out panel. |
| `commit` | `'change'` | `'change'` publishes every step via `onChange`. `'finish'` steps a local draft and publishes only on confirmation. See below. |
| `onCommit(v)` | — | The value was CONFIRMED — Enter, or clicking the pill again to close the editor. |
| `onCancel(v)` | — | The session was ABANDONED — Escape, or an outside press. Receives the value the picker is left holding. |
| `revertOnCancel` | `true` | Cancel restores the value the session started with. |
| `editable` | `true` | Click value to edit inline. On a **collapsed** picker, opening the editor focuses and selects the field. |
| `suffix` | — | Label appended after the value (e.g., `"px"`). |
| `zeroLabel` | — | Display text when value is 0 (e.g., `"∞"`). |
| `displayValue(v)` | — | Format the displayed value. |
| `incrementIcon`, `decrementIcon` | `+`, `−` | JSX content for the buttons. |
| `showRange`, `rangeFormat` | `false` | Show `"3 / 100"`-style range. |
| `invertScroll` | `false` | Wheel-up decrements instead of increments. |
| `disableWheel` | `false` | No mouse-wheel handling. |
| `requireFocus` | `false` | Wheel only works when focused (prevents scroll-trap in scrollable containers). |
| `autoRepeatDelay` | `400` | ms before held +/− starts repeating. |
| `autoRepeatInterval` | `60` | ms between repeats. |
| `autoRepeatAcceleration` | `false` | Interval halves every 1.5s held, floor 15ms. |
| `ariaLabel` | — | Screen-reader name for the picker. |
| `incrementLabel`, `decrementLabel` | `'Increase'`, `'Decrease'` | Button labels (i18n). |
| `disabled` | `false` | Non-interactive. |

## Layouts

| `layout` | Visual |
|---|---|
| `'value-inc-dec'` (default) | `[value][+][−]` |
| `'value-dec-inc'` | `[value][−][+]` |
| `'inc-value-dec'` | `[+][value][−]` |
| `'dec-value-inc'` | `[−][value][+]` |
| `'inc-dec-value'` | `[+][−][value]` |
| `'dec-inc-value'` | `[−][+][value]` |
| `'v-inc-value-dec'` | `[+] / [value] / [−]` (stacked) |
| `'v-dec-value-inc'` | `[−] / [value] / [+]` (stacked) |

## Collapse (`collapsible`)

The picker's chrome is most of its width. In a dense row — a table cell, an order leg, a rail — that chrome is paid for on every row and used on almost none. `collapsible` makes the resting state **the number alone**; the `+`/`−` appear only when you ask for them.

```tsx
<PillNumberPicker collapsible value={qty()} onChange={setQty} min={1} max={100} />
```

- **Collapsed**, the value cell hugs its digits (`max-content`, with the reserved width as a floor) — it can never truncate the number, however large it grows. It is still a full spinbutton: the wheel and the arrow keys step it *without* expanding, so the common case never opens the pop-out at all.
- **Click** (or Enter / Space) expands. The panel renders through a `<Portal>` and is positioned in viewport coordinates — so it is **not clipped** by an ancestor with `overflow: hidden` or `overflow-y: auto`, which is what a plain absolutely-positioned expansion would die to in exactly the dense layouts this feature is for.
- It opens **above** the anchor by preference (a panel below covers the *next* row — usually the next thing the user wants), flipping below only when there isn't room, and clamping into the viewport at the edges.
- The anchor stays in flow while open, so expanding **never reflows the row**.
- Dismiss: outside `pointerdown`, or `Escape` (which returns focus to the anchor).

Controlled, if you need to own it:

```tsx
<PillNumberPicker collapsible open={open()} onOpenChange={setOpen} value={qty()} onChange={setQty} />
```

## The editing session — `commit`, `onCommit`, `onCancel`

Clicking the collapsed pill opens the **editor**: the pop-out, with the value field focused and selected. That starts a *session*, which ends one of two ways:

| | Gesture |
|---|---|
| **Commit** | `Enter`, or clicking the pill again to close it |
| **Cancel** | `Escape`, or a pointerdown outside the pop-out |

`commit` decides **when the value is published**:

- **`'change'` (default)** — every step publishes immediately via `onChange`, exactly as the picker has always behaved. `onCommit` / `onCancel` still fire, so a consumer can tell a *settled* value from one being scrubbed through.
- **`'finish'`** — the pop-out steps a **local draft**. The display updates; `onChange` stays silent; the value is published once, on commit. For a consumer where every intermediate value costs something real — a request per tick, an order repriced on every keystroke — being told about values the user never chose isn't noise, it's wrong, and debouncing at the callsite doesn't fix it.

```tsx
<PillNumberPicker
  collapsible
  commit="finish"
  value={qty()}
  onChange={setQty}                 // fires ONCE, on commit
  onCommit={(v) => placeOrder(v)}   // the user settled on v
  onCancel={() => {}}               // abandoned; value restored
/>
```

**Cancel reverts** by default, and means the same thing in both modes. In `'finish'` that's free (the draft is dropped). In `'change'` the consumer has already *seen* the intermediate values, so the revert is published as a real `onChange(valueAtOpen)` — without that, "cancel" would mean *undo* in one mode and *keep* in the other. Opt out with `revertOnCancel={false}`.

**The collapsed pill still steps in place.** Wheel and arrow keys on the resting pill open no session and publish immediately in both modes — there's nothing to confirm, and requiring a confirmation for a scroll gesture would tax the fastest path the control has.

## A11y

- Wrapper has `role="group"`; value span has `role="spinbutton"` with `aria-valuenow/min/max`.
- Keyboard: ArrowUp/ArrowDown (±step), PageUp/PageDown (±step×10), Home/End (min/max), Enter commits edit, Escape cancels.
- `:focus-visible` ring via `--pnp-focus-ring`.
- RTL: CSS logical properties flip corners for `dir="rtl"` layouts.

## Theming

```css
:root {
  --pnp-bg: #1e293b;
  --pnp-border: #334155;
  --pnp-text: #e2e8f0;
  --pnp-text-muted: #94a3b8;
  --pnp-suffix-color: #64748b;
  --pnp-radius: 9999px;
  --pnp-disabled-opacity: 0.3;
  --pnp-focus-ring: 2px solid #6366f1;
  --pnp-focus-ring-offset: 2px;

  /* collapse / pop-out */
  --pnp-popout-z: 1000;
  --pnp-popout-pad: 0px;
  --pnp-popout-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
```

## Future ideas (not shipped)

- Live digit-filter on input (`filterInput?: 'numeric' | 'digits'`) — today, non-numeric keypresses sit in the draft and are discarded on commit.

## License

MIT
