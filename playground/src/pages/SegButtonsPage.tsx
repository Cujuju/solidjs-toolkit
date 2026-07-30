import { createSignal, type JSX } from 'solid-js';
import { SegGroup, SegButton } from '@cujuju/solidjs-seg-buttons';
import { Code, Card } from '../ui';

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
      <Code cap="usage">{`
import { SegGroup, SegButton } from '@cujuju/solidjs-seg-buttons';
import '@cujuju/solidjs-seg-buttons/styles.css';

const [side, setSide] = createSignal('buy');

<SegGroup value={side()} onChange={setSide} role="radiogroup" ariaLabel="Side">
  <SegButton value="buy" label="Buy" />
  <SegButton value="sell" label="Sell" />
</SegGroup>

// reserveBoldWidth stops the row shifting when the active label goes bold:
<SegGroup value={tf()} onChange={setTf} ariaLabel="Timeframe">
  <SegButton value="1D" label="1D" reserveBoldWidth />
  <SegButton value="1M" label="1M" reserveBoldWidth />
</SegGroup>
`}</Code>

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

      <h2>Hints</h2>
      <p class="note">
        One prop — <code>title</code> — with two renderers. The package imports no tooltip
        library (an optional peer cannot be imported without making it mandatory for every
        consumer's build), so an app hands one in: this playground calls
        <code> setSegTooltipHost(KvTooltip)</code> in <code>main.tsx</code>, which is why the
        hints below are panels rather than native OS tooltips. Remove that line and the same
        markup falls back to a native <code>title</code> with nothing else changing.
      </p>
      <Code cap="wiring the host (once, at app boot)">{`
import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';
import { setSegTooltipHost, setSegTooltipDefaults } from '@cujuju/solidjs-seg-buttons';

setSegTooltipHost(KvTooltip);
setSegTooltipDefaults({ delayMs: 600 });   // optional — re-times every hint at once

<SegButton value="buy" label="Buy" title="Long the underlying" />
`}</Code>
      <div class="row">
        <Card cap="hover a segment — the host renders the hint">
          <SegGroup value={side()} onChange={setSide} role="radiogroup" ariaLabel="Side">
            <SegButton value="buy" label="Buy" title="Long the underlying at the ask." />
            <SegButton value="sell" label="Sell" title="Short the underlying at the bid." />
          </SegGroup>
        </Card>
        <Card cap="tooltipDelayMs overrides the shared delay for one button">
          <SegGroup ariaLabel="Delays">
            <SegButton label="default" title="Waits the shared default before showing." />
            <SegButton label="instant" title="Shows immediately." tooltipDelayMs={0} />
            <SegButton label="no hint" />
          </SegGroup>
        </Card>
      </div>
    </>
  );
}
