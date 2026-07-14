import { createSignal, type JSX } from 'solid-js';
import { Flyout, type FlyoutOption } from '@cujuju/solidjs-select-flyout';
import { Card, ClipBox, ScrollBox } from '../ui';

const TIMEFRAMES: FlyoutOption[] = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1w', label: '1 week (history only)', disabled: true },
];

export function SelectFlyoutPage(): JSX.Element {
  const [tf, setTf] = createSignal('5m');
  const [tf2, setTf2] = createSignal('1h');

  return (
    <>
      <h1>@cujuju/solidjs-select-flyout</h1>
      <p class="note">
        A select that opens a <code>.glass-menu</code> panel instead of a native dropdown —
        so it can be themed, and so a disabled option can say WHY it is disabled.
      </p>

      <h2>Basic</h2>
      <div class="row">
        <Card cap="options, one of them disabled">
          <Flyout options={TIMEFRAMES} value={tf()} onChange={setTf} ariaLabel="Timeframe" />
          <span class="readout">value <b>{tf()}</b></span>
        </Card>
        <Card cap="disabled">
          <Flyout options={TIMEFRAMES} value={tf()} onChange={setTf} disabled />
        </Card>
        <Card cap="placeholder — nothing selected">
          <Flyout options={TIMEFRAMES} value="" onChange={() => {}} placeholder="Pick one…" />
        </Card>
      </div>

      <h2>Hostile ancestors</h2>
      <div class="row">
        <Card cap="overflow: hidden">
          <ClipBox width="140px">
            <Flyout options={TIMEFRAMES} value={tf2()} onChange={setTf2} />
          </ClipBox>
        </Card>
        <Card cap="overflow-y: auto">
          <ScrollBox>
            <div style={{ padding: '10px' }}>
              <Flyout options={TIMEFRAMES} value={tf2()} onChange={setTf2} />
            </div>
          </ScrollBox>
        </Card>
      </div>
    </>
  );
}
