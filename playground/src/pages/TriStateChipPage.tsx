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
  { id: 'check-cross', cap: '✓ / ✗ (default)', include: '✓ ', exclude: '✗ ' },
  { id: 'check-ballot', cap: '✔ / ✘ (heavy)', include: '✔ ', exclude: '✘ ' },
  { id: 'plus-minus', cap: '+ / − (former default)', include: '+ ', exclude: '− ' },
] as const;

/** Candidate NEUTRAL glyphs — what the unselected state shows. */
const NEUTRAL_GLYPHS = [
  { id: 'none', cap: 'none', glyph: '' },
  { id: 'underscore', cap: '_ underscore', glyph: '_ ' },
  { id: 'underscore-wide', cap: '＿ full-width', glyph: '＿' },
  // Only available now that '−' no longer means "excluded": a dash reads as
  // "not set" and sits at the same optical height as ✓/✗, so cycling does not
  // hop the glyph up and down the way an underscore does.
  { id: 'dash', cap: '– dash', glyph: '– ' },
  { id: 'ring', cap: '○ ring', glyph: '○ ' },
  { id: 'dot', cap: '· dot', glyph: '· ' },
  { id: 'small-ring', cap: '◦ small ring', glyph: '◦ ' },
] as const;

/**
 * Glyph-FREE variants. Each carries the state without a character in the text
 * flow, so no column is reserved and the chip is the same width in every
 * state — with nothing to fill while unselected.
 */
const GLYPHLESS = [
  { id: 'strike', cap: 'strike — cross out the excluded label' },
  { id: 'marks', cap: 'marks — underline included / strike excluded' },
  { id: 'badge', cap: 'badge — corner disc, out of flow' },
  { id: 'rail', cap: 'rail — inline-start stripe (inset shadow)' },
  { id: 'tint', cap: 'tint — colour only' },
] as const;

/** A row of chips wired to its own independent state, with no glyphs at all. */
function GlyphlessRow(props: {
  indicator: 'strike' | 'marks' | 'badge' | 'rail' | 'tint';
}): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });
  return (
    <For each={TAGS.slice(0, 3)}>
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

/** A row of chips wired to its own independent state. */
function ChipRow(props: {
  include: string;
  exclude: string;
  neutral: string;
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
        />
      )}
    </For>
  );
}

export function TriStateChipPage(): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });
  const [neutral, setNeutral] = createSignal<string>('_ ');

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

      <h2>No glyph column at all</h2>
      <p class="note">
        The reserved column exists only because the state mark was assumed to be a CHARACTER IN
        THE TEXT FLOW. Carry the state some other way and the problem dissolves. Each row below is
        a built-in <code>indicator</code> — <code>strike</code>, <code>marks</code>,{' '}
        <code>badge</code>, <code>rail</code>, <code>tint</code> — none of which put a glyph in the
        flow, so there is no column, nothing to reserve, nothing blank while unselected, and the
        chip is exactly as wide as its label in all three states. <b>Click twice to cycle.</b>{' '}
        Nothing here moves, ever.
      </p>
      <div class="row">
        <For each={GLYPHLESS}>
          {(v) => (
            <Card cap={v.cap}>
              <GlyphlessRow indicator={v.id} />
            </Card>
          )}
        </For>
      </div>

      <h2>Glyph set</h2>
      <p class="note">
        The glyph column is reserved in every state, so all three states measure the same and a
        row never reflows on click. The only open question is what fills it: which pair reads as
        include / exclude, and what the <b>unselected</b> state shows. An underscore is the
        placeholder idiom — it sits on the baseline like a blank waiting to be filled, rather than
        asserting a mark of its own. <b>Click any chip twice to cycle it fully.</b>
      </p>

      <div class="row">
        <Card cap="neutral glyph (the unselected state)" wide>
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
      </div>

      <div class="row">
        <For each={GLYPH_SETS}>
          {(set) => (
            <Card cap={set.cap}>
              <ChipRow include={set.include} exclude={set.exclude} neutral={neutral()} />
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
              />
            </Card>
          )}
        </For>
      </div>
    </>
  );
}
