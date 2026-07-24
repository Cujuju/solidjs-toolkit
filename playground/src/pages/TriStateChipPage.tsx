import { For, createSignal, type JSX } from 'solid-js';
import {
  TriStateChip,
  applyTriState,
  tristateOf,
  EMPTY_TRI_STATE,
  type TriStateValue,
} from '@cujuju/solidjs-tri-state-chip';
import { Card, Code } from '../ui';

const TAGS = ['calls', 'puts', 'weeklies', 'monthlies', '0DTE'];

/**
 * The built-in state indicators. Everything except `glyph` carries the state
 * WITHOUT a character in the text flow, so no column is reserved, nothing sits
 * blank in the neutral state, and the chip is exactly its label's width.
 */
const INDICATORS = [
  { id: 'strike', cap: 'strike — the default; excluded is crossed out' },
  { id: 'cut', cap: 'cut — inverse strike: the knockout, no line' },
  { id: 'hatch', cap: 'hatch — diagonal hazard tape across the chip' },
  { id: 'marks', cap: 'marks — + underline on included (not colour alone)' },
  { id: 'badge', cap: 'badge — corner disc, out of flow' },
  { id: 'rail', cap: 'rail — inline-start stripe' },
  { id: 'tint', cap: 'tint — colour only' },
  { id: 'glyph', cap: 'glyph — leading ✓ / ✗ in a fixed column' },
] as const;

/** A row of chips wired to its own independent state. */
function ChipRow(props: {
  indicator?: 'glyph' | 'strike' | 'cut' | 'hatch' | 'marks' | 'badge' | 'rail' | 'tint';
  count?: number;
}): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });
  return (
    <For each={TAGS.slice(0, props.count ?? 3)}>
      {(tag) => (
        <TriStateChip
          label={tag}
          value={tristateOf(value(), tag)}
          onCycle={(next) => setValue((v) => applyTriState(v, tag, next))}
          indicator={props.indicator}
        />
      )}
    </For>
  );
}

export function TriStateChipPage(): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });

  return (
    <>
      <h1>@cujuju/solidjs-tri-state-chip</h1>
      <p class="note">
        One chip, three states: <b>unselected</b> → <b>included</b> → <b>excluded</b> → back.
        The transitions are pure helpers (<code>cycleTriState</code>, <code>applyTriState</code>,{' '}
        <code>tristateOf</code>), so a store or a test can use them without rendering a chip.
      </p>
      <Code cap="usage">{`
import {
  TriStateChip, applyTriState, tristateOf,
  EMPTY_TRI_STATE, type TriStateValue,
} from '@cujuju/solidjs-tri-state-chip';
import '@cujuju/solidjs-tri-state-chip/styles.css';

const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });

<For each={TAGS}>{(tag) => (
  <TriStateChip
    label={tag}
    value={tristateOf(value(), tag)}
    onCycle={(next) => setValue((v) => applyTriState(v, tag, next))}
  />
)}</For>

// value() -> { included: ['calls'], excluded: ['puts'] }
`}</Code>

      <h2>Click each chip twice to cycle it fully</h2>
      <p class="note">
        The chip is pure presentation — the value lives in your store and the helpers do the
        transitions.
      </p>
      <div class="row">
        <Card cap="the three states">
          <For each={TAGS}>
            {(tag) => (
              <TriStateChip
                label={tag}
                value={tristateOf(value(), tag)}
                onCycle={(next) => setValue((v) => applyTriState(v, tag, next))}
              />
            )}
          </For>
        </Card>
        <Card cap="value">
          <span class="readout">
            included <b>{value().included.join(', ') || '—'}</b>
            <br />excluded <b>{value().excluded.join(', ') || '—'}</b>
          </span>
        </Card>
        <Card cap="disabled">
          <TriStateChip label="frozen" value="included" onCycle={() => {}} disabled />
        </Card>
      </div>

      <h2>Indicators — how the state is shown</h2>
      <p class="note">
        Every chip below is the same width in all three states, so a row never reflows when you
        click. <code>strike</code> is the default; the rest are one prop away.
      </p>
      <div class="row">
        <For each={INDICATORS}>
          {(v) => (
            <Card cap={v.cap}>
              <ChipRow indicator={v.id} />
            </Card>
          )}
        </For>
      </div>
      <Code cap="picking an indicator">{`
// 'strike' is the DEFAULT — omit the prop to get it.
<TriStateChip label="puts" value={s} onCycle={f} />

// Any other treatment is one prop:
<TriStateChip label="puts" value={s} onCycle={f} indicator="badge" />
//   'strike' | 'cut' | 'hatch' | 'marks' | 'badge' | 'rail' | 'tint'
//                                                   -> no glyph column
//   'glyph'                                         -> leading ✓ / ✗ column

// glyph mode: the bare (neutral) label is CENTRED; a ✓/✗ offsets it right.
// Give the neutral state its own mark if you want one:
<TriStateChip … indicator="glyph" neutralPrefix="– " />
`}</Code>

      <h2>Theming</h2>
      <p class="note">
        Colours, the tint strength and the strike geometry are all custom properties.{' '}
        <code>--ctc-surface</code> is the one you must set: the strike's knockout is composited
        against it.
      </p>
      <Code cap="tokens">{`
/* The strike is a thin line wrapped in a KNOCKOUT — a band of the chip's own
   colour that erases the glyphs either side, so the line reads as cut THROUGH
   the word. The knockout is composited from the same tint the chip paints, so
   the two cannot drift apart. */
:root {
  --ctc-surface: #0f172a;            /* what the chip SITS ON — required */
  --ctc-tint-strength: 15%;          /* shared by state fills + knockout */
  --ctc-strike-thickness: 1px;       /* the visible line */
  --ctc-strike-knockout-width: 0.5px;/* dead space each side of it */
  --ctc-cut-thickness: 2px;          /* indicator="cut": the gap, no line */

  /* indicator="hatch": the hazard tape. Bar / space / pitch. */
  --ctc-hatch-angle: 45deg;
  --ctc-hatch-stripe-width: 2px;
  --ctc-hatch-gap-width: 3px;
  --ctc-hatch-color: color-mix(in srgb, var(--ctc-color-excluded) 30%, transparent);

  --ctc-color-included: #10b981;
  --ctc-color-excluded: #f43f5e;

  /* Focus ring: a LIGHTENED version of the chip's own state colour.
     Override for a brighter one. */
  --ctc-focus-ring-color: color-mix(in srgb, currentColor 55%, #fff);
}
`}</Code>
    </>
  );
}
