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

/**
 * The `hatch` tape is entirely token-driven, so every variation below is the
 * SAME indicator with different custom properties — no second component, no
 * second code path. Each entry is exactly the override you would paste into
 * your own stylesheet.
 */
const HATCH_VARIANTS = [
  {
    cap: 'tape ACROSS the label (default)',
    vars: {},
  },
  {
    cap: 'tape BEHIND the label',
    vars: { '--ctc-hatch-tape-z': '0' },
  },
  {
    cap: 'double bar — 4px stripe, same 3px gap',
    vars: { '--ctc-hatch-stripe-width': '4px' },
  },
  {
    cap: 'double pitch — 4px stripe, 6px gap',
    vars: { '--ctc-hatch-stripe-width': '4px', '--ctc-hatch-gap-width': '6px' },
  },
  {
    cap: '−45° — tape leans the other way',
    vars: { '--ctc-hatch-angle': '-45deg' },
  },
  {
    cap: '−45°, double bar, behind the label',
    vars: {
      '--ctc-hatch-angle': '-45deg',
      '--ctc-hatch-stripe-width': '4px',
      '--ctc-hatch-tape-z': '0',
    },
  },
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

/**
 * A hatch row that STARTS with one chip excluded — the variants differ only in
 * the excluded state, so a row you have to click twice before it shows anything
 * is useless for comparing them side by side. The other two chips stay live so
 * the transition is still there to click through.
 */
function HatchRow(props: { vars: Record<string, string> }): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({
    included: [],
    excluded: [TAGS[0]],
  });
  return (
    <div class="hatch-variant" style={props.vars}>
      <For each={TAGS.slice(0, 3)}>
        {(tag) => (
          <TriStateChip
            label={tag}
            value={tristateOf(value(), tag)}
            onCycle={(next) => setValue((v) => applyTriState(v, tag, next))}
            indicator="hatch"
          />
        )}
      </For>
    </div>
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

      <h2>Hatch variants — all one indicator, all tokens</h2>
      <p class="note">
        Every card below is <code>indicator="hatch"</code> with a different set of custom
        properties. The first chip in each row starts <b>excluded</b> so the tape is visible
        without clicking; the other two are live.
      </p>
      <div class="row">
        <For each={HATCH_VARIANTS}>
          {(v) => (
            <Card cap={v.cap}>
              <HatchRow vars={v.vars} />
            </Card>
          )}
        </For>
      </div>
      <Code cap="the hatch tokens">{`
/* Tape ACROSS the label (default) or BEHIND it. The label is
   position:relative with an auto z-index, so tape at 1 covers it and
   tape at 0 ties on level and loses the tie-break to tree order. */
--ctc-hatch-tape-z: 1;      /* 0 = behind the text */

--ctc-hatch-angle: 45deg;         /* -45deg leans the other way */
--ctc-hatch-stripe-width: 2px;    /* the bar   */
--ctc-hatch-gap-width: 3px;       /* the space */

/* Scale BOTH to keep the duty cycle and just zoom the tape;
   raise only the bar to make it heavier at the same pitch. */
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
