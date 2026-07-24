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
  { id: 'hatch', cap: 'hatch — the default; hazard tape across the chip' },
  { id: 'strike', cap: 'strike — excluded is crossed out' },
  { id: 'cut', cap: 'cut — inverse strike: the knockout, no line' },
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
    cap: 'the default — 4px / 6px, tape behind the label',
    vars: {},
  },
  {
    cap: 'tape ACROSS the label — breaks glyphs at this bar width',
    vars: { '--ctc-hatch-tape-z': '1' },
  },
  {
    cap: 'tighter — 2px stripe, 3px gap (same 2:3 duty cycle)',
    vars: { '--ctc-hatch-stripe-width': '2px', '--ctc-hatch-gap-width': '3px' },
  },
  {
    cap: 'heavier bar — 6px stripe, same 6px gap',
    vars: { '--ctc-hatch-stripe-width': '6px' },
  },
  {
    cap: '−45° — tape leans the other way',
    vars: { '--ctc-hatch-angle': '-45deg' },
  },
  {
    cap: 'tighter + across, which is where across still works',
    vars: {
      '--ctc-hatch-stripe-width': '2px',
      '--ctc-hatch-gap-width': '3px',
      '--ctc-hatch-tape-z': '1',
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

/**
 * The same starts-excluded row, but driven by the PROPS rather than by tokens
 * on a wrapper — so the two mechanisms can be compared directly on one page.
 */
function HatchPropRow(props: { angle: string; stripe: string; gap: string }): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({
    included: [],
    excluded: [TAGS[0]],
  });
  return (
    <For each={TAGS.slice(0, 3)}>
      {(tag) => (
        <TriStateChip
          label={tag}
          value={tristateOf(value(), tag)}
          onCycle={(next) => setValue((v) => applyTriState(v, tag, next))}
          hatchAngle={props.angle}
          hatchStripeWidth={props.stripe}
          hatchGapWidth={props.gap}
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
        click. <code>hatch</code> is the default; the rest are one prop away.
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
// 'hatch' is the DEFAULT — omit the prop to get it.
<TriStateChip label="puts" value={s} onCycle={f} />

// Any other treatment is one prop:
<TriStateChip label="puts" value={s} onCycle={f} indicator="badge" />
//   'hatch' | 'strike' | 'cut' | 'marks' | 'badge' | 'rail' | 'tint'
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
      <h2>Hatch geometry from the callsite</h2>
      <p class="note">
        The same three knobs as props, for when one chip has to differ from its neighbours
        without a stylesheet. They write the custom properties inline, so props and CSS are the
        same mechanism — set the tokens at <code>:root</code> for an app-wide look and reach for
        the props only for a one-off.
      </p>
      <div class="row">
        <Card cap="hatchStripeWidth='1px' hatchGapWidth='3px'">
          <HatchPropRow angle="45deg" stripe="1px" gap="3px" />
        </Card>
        <Card cap="hatchAngle='-45deg' hatchStripeWidth='6px'">
          <HatchPropRow angle="-45deg" stripe="6px" gap="6px" />
        </Card>
        <Card cap="hatchAngle='90deg' — vertical bars">
          <HatchPropRow angle="90deg" stripe="3px" gap="7px" />
        </Card>
        <Card cap="hatchAngle='0deg' — horizontal bars">
          <HatchPropRow angle="0deg" stripe="3px" gap="7px" />
        </Card>
      </div>
      <Code cap="the props">{`
// Per chip. Values are CSS strings, so 'em' and '%' work as well as 'px'.
<TriStateChip
  label="puts" value={s} onCycle={f}
  hatchAngle="-45deg"
  hatchStripeWidth="4px"
  hatchGapWidth="6px"
/>

// Omitted props write NOTHING — the stylesheet's value survives. That is
// why they are optional strings and not defaulted in the component: a
// default here would silently outrank every :root token you set.
`}</Code>

      <Code cap="the hatch tokens">{`
/* Tape BEHIND the label (default) or ACROSS it. The label is
   position:relative with an auto z-index, so tape at 1 covers it and
   tape at 0 ties on level and loses the tie-break to tree order.
   Behind is the default because a 4px bar is wider than a glyph
   stroke at 10-13px — across it, the letterforms break rather than
   veil. Thin the bar first if you want the literal taped-door look. */
--ctc-hatch-tape-z: 0;      /* 1 = over the text */

--ctc-hatch-angle: 45deg;         /* -45deg leans the other way */
--ctc-hatch-stripe-width: 4px;    /* the bar   */
--ctc-hatch-gap-width: 6px;       /* the space */

/* Scale BOTH to keep the 2:3 duty cycle and just zoom the tape;
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

  /* indicator="hatch": the hazard tape. Bar / space / lean / layer. */
  --ctc-hatch-angle: 45deg;
  --ctc-hatch-stripe-width: 4px;
  --ctc-hatch-gap-width: 6px;
  --ctc-hatch-tape-z: 0;
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
