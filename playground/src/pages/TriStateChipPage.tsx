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

export function TriStateChipPage(): JSX.Element {
  const [value, setValue] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });

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
    </>
  );
}
