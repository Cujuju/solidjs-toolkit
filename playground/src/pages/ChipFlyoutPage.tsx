import { createSignal, type JSX } from 'solid-js';
import {
  ChipFlyout,
  EMPTY_TRI_STATE,
  type ChipOption,
  type TriStateValue,
} from '@cujuju/solidjs-chip-flyout';
import { Card, ClipBox } from '../ui';

const BROKERS: ChipOption[] = [
  { value: 'schwab', label: 'Schwab', group: 'Equities' },
  { value: 'tastytrade', label: 'tastytrade', group: 'Equities' },
  { value: 'alpaca', label: 'Alpaca', group: 'Equities' },
  { value: 'kalshi', label: 'Kalshi', group: 'Events' },
];

const STRATEGIES: ChipOption[] = [
  { value: 'ic', label: 'Iron condor' },
  { value: 'cs', label: 'Credit spread' },
  { value: 'cc', label: 'Covered call' },
  { value: 'strangle', label: 'Strangle' },
  { value: 'calendar', label: 'Calendar' },
];

export function ChipFlyoutPage(): JSX.Element {
  const [tri, setTri] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });
  const [multi, setMulti] = createSignal<string[]>(['ic']);

  return (
    <>
      <h1>@cujuju/solidjs-chip-flyout</h1>
      <p class="note">
        A filter chip that opens a panel of chips. Two modes: <b>tri-state</b> (each chip cycles
        unselected → included → excluded) and <b>multi</b> (a plain two-state toggle).
      </p>

      <h2>Both modes</h2>
      <div class="row">
        <Card cap="tri-state — include / exclude">
          <ChipFlyout
            mode="tri-state"
            label="Broker"
            panelTitle="Filter by broker"
            options={BROKERS}
            value={tri()}
            onChange={setTri}
          />
          <span class="readout">
            in <b>{tri().included.join(', ') || '—'}</b> · out{' '}
            <b>{tri().excluded.join(', ') || '—'}</b>
          </span>
        </Card>
        <Card cap="multi — plain toggle">
          <ChipFlyout
            mode="multi"
            label="Strategy"
            options={STRATEGIES}
            value={multi()}
            onChange={setMulti}
            sort
          />
          <span class="readout">
            selected <b>{multi().join(', ') || '—'}</b>
          </span>
        </Card>
      </div>

      <h2>Hostile ancestor</h2>
      <div class="row">
        <Card cap="overflow: hidden — the panel is top-layer, so it escapes">
          <ClipBox width="140px">
            <ChipFlyout
              mode="multi"
              label="Strategy"
              options={STRATEGIES}
              value={multi()}
              onChange={setMulti}
            />
          </ClipBox>
        </Card>
      </div>
    </>
  );
}
