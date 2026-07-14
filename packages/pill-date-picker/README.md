# @cujuju/solidjs-pill-date-picker

Compact expiration / DTE picker for SolidJS. Collapsed, it is the date alone (`Jul 17`) with
the DTE in a hover tooltip; expanded, it pops out a portalled ladder of every expiration with
both its DTE and its date.

The caller supplies the dates. The control does not fetch, validate, sort, or filter them — it
renders what it is given and computes the DTE itself.

## Install

```sh
pnpm add @cujuju/solidjs-pill-date-picker @cujuju/solidjs-kv-tooltip
```

Peer dependencies: `solid-js >= 1.7.0`, `@cujuju/solidjs-kv-tooltip`.

## Usage

```tsx
import { PillDatePicker } from '@cujuju/solidjs-pill-date-picker';
import '@cujuju/solidjs-pill-date-picker/styles.css';

const [expiry, setExpiry] = createSignal<string | null>('2026-07-17');

<PillDatePicker
  items={['2026-06-19', '2026-06-26', '2026-07-17', '2026-09-18']}
  value={expiry()}
  onChange={(item) => setExpiry(item)}
  ariaLabel="Expiration"
/>
```

### Carrying your own payload

`items` also accepts objects. Whatever else you hang off each entry comes back through
`onChange` by reference — the ORIGINAL item, not a copy — with its types intact.

```tsx
const chain = [
  { date: '2026-06-19', oi: 12_400, monthly: false },
  { date: '2026-07-17', oi: 98_100, monthly: true },
];

<PillDatePicker
  items={chain}
  value={expiry()}
  onChange={(item) => {
    setExpiry(item.date);
    console.log(item.oi, item.monthly); // still there, still typed
  }}
  tooltipEntries={(item, dte) => ({
    Expires: item.date,
    DTE: `${dte}d`,
    OI: item.oi.toLocaleString(),
  })}
/>
```

## Props

| Prop | Default | Description |
|---|---|---|
| `items` | (required) | Ordered list of expirations. `string[]` of ISO dates, or objects with a `date` key. Rendered verbatim; assumed legitimate. |
| `value` | — | The selected expiration, as its **ISO date**. Keyed by date, not by object identity, so a refetched chain does not silently deselect. |
| `onChange` | (required) | Fires with the ORIGINAL item. |
| `now` | `new Date()` | The clock DTE is measured from. Inject it to make DTE deterministic (tests, replay, backtests). |
| `size` | `'md'` | `'xs' \| 'sm' \| 'md'` — matches the sibling pill-number-picker's rhythm. |
| `disabled` | `false` | |
| `placeholder` | `'Select'` | Collapsed label when nothing is selected. |
| `emptyMessage` | `'No expirations'` | Pop-out body when `items` is empty. |
| `open` / `onOpenChange` | — | Controlled open state. Omit `open` for uncontrolled; `onOpenChange` fires either way. |
| `popoutGap` | `4` | Gap in px between the pill and the panel. |
| `preferPlacement` | `'bottom'` | Side to open toward when both fit. |
| `dteRamp` | see below | Ordered urgency bands, first match wins. |
| `formatDate` | `Jul 17` | Override the collapsed/row label — the escape hatch for locales. |
| `tooltipEntries` | long date + DTE | Rows for the hover tooltip. Takes the whole item. |
| `disableTooltip` | `false` | |
| `ariaLabel`, `class` | — | Passthrough. |

## DTE

DTE is a **calendar-day** difference, not an elapsed-time division. `(expiry - now) / 86400000`
is the obvious implementation and it is wrong twice: it drifts with the time of day (34 days at
09:00, 33 at 23:00 — same date), and doing the arithmetic on local dates makes a DST boundary a
23- or 25-hour day, so the floor lands one day off. Both ends are collapsed to UTC midnight
first, `now` via its **local** calendar fields (a trader at 20:00 ET on the 16th is on the 16th).

Negative DTEs are returned as-is. You own which dates are legitimate; clamping an expired entry
to `0d` would hide your bug behind our formatting.

## DTE colour

The urgency ramp is a **prop**, because "urgent" is a house opinion:

```tsx
<PillDatePicker
  dteRamp={[
    { maxDte: 0,   color: 'var(--danger)' },
    { maxDte: 7,   color: 'var(--warn)' },
    { maxDte: 30,  color: 'var(--caution)' },
    { maxDte: Infinity, color: 'var(--muted)' },
  ]}
  ...
/>
```

Bounds are inclusive upper edges, consulted in order, first match wins. The default ramp resolves
to `--pdp-dte-expiring` / `--pdp-dte-urgent` / `--pdp-dte-near` / `--pdp-dte-far`, so the common
case is re-themed from your stylesheet without touching the prop at all.

## The pop-out

The panel is rendered through a `<Portal>` and positioned in **viewport** coordinates. That is
not a stylistic choice: the pill lives in a dense row, dense rows live inside `overflow: hidden`
and `overflow-y: auto` boxes, and an in-flow expansion is clipped dead by such an ancestor. It
repositions on resize and on a **capturing** scroll listener — the container that scrolls the
anchor out from under the panel is almost never `window`.

Prefers to open **downward** (a list reads top-down from its trigger), flipping up when there is
no room below, and clamping — top edge first — when there is room on neither side.

## Theming

```css
:root {
  --pdp-bg: #1e293b;
  --pdp-border: #334155;
  --pdp-text: #e2e8f0;
  --pdp-text-muted: #94a3b8;
  --pdp-radius: 6px;
  --pdp-hover-bg: rgba(255, 255, 255, 0.06);

  --pdp-popout-z: 1000;
  --pdp-popout-bg: #1e293b;
  --pdp-popout-border: #334155;
  --pdp-popout-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  --pdp-popout-min-width: 132px;
  --pdp-popout-max-height: 260px;

  --pdp-row-hover-bg: rgba(255, 255, 255, 0.07);
  --pdp-row-selected-bg: rgba(99, 102, 241, 0.18);

  --pdp-dte-expiring: #f87171;
  --pdp-dte-urgent: #fb923c;
  --pdp-dte-near: #fbbf24;
  --pdp-dte-far: #94a3b8;
}
```

## License

MIT
