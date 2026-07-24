import { For, createSignal, type JSX } from 'solid-js';
import {
  TriStateChip,
  applyTriState,
  tristateOf,
  EMPTY_TRI_STATE,
  type TriStateValue,
} from '@cujuju/solidjs-tri-state-chip';
import { Card } from '../ui';

const TAGS = ['calls', 'puts', 'weeklies', 'monthlies', '0DTE'];

/** Candidate glyph sets, for picking one live rather than from a screenshot. */
const GLYPH_SETS = [
  { id: 'plus-minus', cap: '+ / − (current)', include: '+ ', exclude: '− ' },
  { id: 'check-cross', cap: '✓ / ✗', include: '✓ ', exclude: '✗ ' },
  { id: 'check-times', cap: '✓ / ×', include: '✓ ', exclude: '× ' },
  { id: 'check-ballot', cap: '✔ / ✘ (heavy)', include: '✔ ', exclude: '✘ ' },
  { id: 'circled', cap: '⊕ / ⊖ (one family)', include: '⊕ ', exclude: '⊖ ' },
] as const;

/** Candidate NEUTRAL glyphs — what the unselected state shows. */
const NEUTRAL_GLYPHS = [
  { id: 'none', cap: 'none', glyph: '' },
  { id: 'ring', cap: '○ ring', glyph: '○ ' },
  { id: 'dot', cap: '· dot', glyph: '· ' },
  { id: 'small-ring', cap: '◦ small ring', glyph: '◦ ' },
] as const;

/** A row of chips wired to its own independent state. */
function ChipRow(props: {
  include: string;
  exclude: string;
  neutral: string;
  mode: 'reserve' | 'overlay';
}): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });
  return (
    <For each={TAGS.slice(0, 3)}>
      {(tag) => (
        <TriStateChip
          label={tag}
          value={tristateOf(value(), tag)}
          onCycle={(next) => setValue((v) => applyTriState(v, tag, next))}
          includePrefix={props.include}
          excludePrefix={props.exclude}
          neutralPrefix={props.neutral}
          prefixMode={props.mode}
        />
      )}
    </For>
  );
}

export function TriStateChipPage(): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });
  const [neutral, setNeutral] = createSignal<string>('○ ');
  const [mode, setMode] = createSignal<'reserve' | 'overlay'>('reserve');

  return (
    <>
      <h1>@cujuju/solidjs-tri-state-chip</h1>
      <p class="note">
        One chip, three states: <b>unselected</b> → <b>included</b> → <b>excluded</b> → back.
        The state transitions are pure helpers (<code>cycleTriState</code>,{' '}
        <code>applyTriState</code>, <code>tristateOf</code>), so a store or a test can use them
        without rendering a chip.
      </p>

      <h2>Click each chip twice to cycle it fully</h2>
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

      <h2>Glyph set + spacing mode</h2>
      <p class="note">
        Two questions at once. <b>Which glyph pair</b> reads as include / exclude, and{' '}
        <b>where the glyph lives</b>. In <code>reserve</code> the glyph sits in the layout in a
        column as wide as the widest of the three glyphs — the chip is the same width in every
        state, but the column is visibly blank when the neutral glyph is <code>none</code>. In{' '}
        <code>overlay</code> the glyph is out of flow inside the chip's own padding: no column, no
        blank, and the chip measures exactly as if it had no glyph at all — but the glyph only has
        the padding to live in. <b>Click any chip twice to cycle it through all three states</b> and
        watch whether the row shifts.
      </p>

      <div class="row">
        <Card cap="neutral glyph (the unselected state)">
          <For each={NEUTRAL_GLYPHS}>
            {(n) => (
              <button
                class="demo-btn"
                data-active={neutral() === n.glyph ? 'true' : undefined}
                onClick={() => setNeutral(n.glyph)}
              >
                {n.cap}
              </button>
            )}
          </For>
        </Card>
        <Card cap="spacing mode">
          <For each={['reserve', 'overlay'] as const}>
            {(m) => (
              <button
                class="demo-btn"
                data-active={mode() === m ? 'true' : undefined}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            )}
          </For>
        </Card>
      </div>

      <div class="row">
        <For each={GLYPH_SETS}>
          {(set) => (
            <Card cap={set.cap}>
              <ChipRow
                include={set.include}
                exclude={set.exclude}
                neutral={neutral()}
                mode={mode()}
              />
            </Card>
          )}
        </For>
      </div>

      <h2>Width stability — the thing that was broken</h2>
      <p class="note">
        Every chip below is pinned to one state, same label, so their widths are directly
        comparable. They must all measure the same regardless of state; before the fix the
        unselected chip was 50.02px against 58.20px selected, so a row reflowed on every click.
      </p>
      <div class="row">
        <For each={['unselected', 'included', 'excluded'] as const}>
          {(state) => (
            <Card cap={state}>
              <TriStateChip
                label="sample"
                value={state}
                onCycle={() => {}}
                neutralPrefix={neutral()}
                prefixMode={mode()}
              />
            </Card>
          )}
        </For>
      </div>
    </>
  );
}
