import { createSignal, type JSX } from 'solid-js';
import { SegGroup, SegButton } from '@cujuju/solidjs-seg-buttons';
import { Card } from '../ui';

export function SegButtonsPage(): JSX.Element {
  const [side, setSide] = createSignal<'buy' | 'sell'>('buy');
  const [tf, setTf] = createSignal('1D');
  const [size, setSize] = createSignal<'xs' | 'sm' | 'md'>('sm');

  return (
    <>
      <h1>@cujuju/solidjs-seg-buttons</h1>
      <p class="note">
        Segmented buttons. <code>SegGroup</code> owns the value; <code>SegButton</code> can also
        be driven standalone with <code>active</code> + <code>onClick</code>.
        <code> reserveBoldWidth</code> stops the group from twitching when the active label goes
        bold — the width is reserved for the bold text up front.
      </p>

      <h2>Grouped (radiogroup)</h2>
      <div class="row">
        <Card cap="value-driven group">
          <SegGroup value={side()} onChange={setSide} role="radiogroup" ariaLabel="Side">
            <SegButton value="buy" label="Buy" />
            <SegButton value="sell" label="Sell" />
          </SegGroup>
          <span class="readout">side <b>{side()}</b></span>
        </Card>
        <Card cap="timeframes — reserveBoldWidth, so nothing shifts on select">
          <SegGroup value={tf()} onChange={setTf} ariaLabel="Timeframe">
            <SegButton value="1D" label="1D" reserveBoldWidth />
            <SegButton value="5D" label="5D" reserveBoldWidth />
            <SegButton value="1M" label="1M" reserveBoldWidth />
            <SegButton value="1Y" label="1Y" reserveBoldWidth />
            <SegButton value="ALL" label="ALL" reserveBoldWidth disabled />
          </SegGroup>
        </Card>
      </div>

      <h2>Sizes</h2>
      <div class="row">
        <Card cap="xs / sm / md">
          <SegGroup value={size()} onChange={setSize} ariaLabel="Size">
            <SegButton value="xs" label="xs" size="xs" />
            <SegButton value="sm" label="sm" size="sm" />
            <SegButton value="md" label="md" size="md" />
          </SegGroup>
          <span class="readout">size <b>{size()}</b></span>
        </Card>
      </div>
    </>
  );
}
