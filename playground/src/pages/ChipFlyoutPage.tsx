import { createSignal, type JSX } from 'solid-js';
import {
  ChipFlyout,
  EMPTY_TRI_STATE,
  type ChipOption,
  type TriStateValue,
} from '@cujuju/solidjs-chip-flyout';
import {
  Card,
  ClipBox,
  EdgeRight,
  EventLog,
  ScrollBox,
  createEventLog,
  Code,
} from '../ui';

const BROKERS: ChipOption[] = [
  { value: 'schwab', label: 'Schwab', group: 'Equities' },
  { value: 'tastytrade', label: 'tastytrade', group: 'Equities' },
  { value: 'alpaca', label: 'Alpaca', group: 'Equities' },
  { value: 'kalshi', label: 'Kalshi', group: 'Events' },
  { value: 'polymarket', label: 'Polymarket', group: 'Events' },
];

const STRATEGIES: ChipOption[] = [
  { value: 'ic', label: 'Iron condor' },
  { value: 'cs', label: 'Credit spread' },
  { value: 'cc', label: 'Covered call' },
  { value: 'strangle', label: 'Strangle' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'butterfly', label: 'Butterfly' },
  { value: 'ratio', label: 'Ratio spread' },
];

export function ChipFlyoutPage(): JSX.Element {
  const log = createEventLog();
  const [tri, setTri] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });
  const [multi, setMulti] = createSignal<string[]>(['ic']);
  const [ctrlOpen, setCtrlOpen] = createSignal(false);
  const [ctrlValue, setCtrlValue] = createSignal<string[]>([]);
  const [search, setSearch] = createSignal('');

  const filtered = (): ChipOption[] =>
    STRATEGIES.filter((o) => o.label.toLowerCase().includes(search().toLowerCase()));

  return (
    <>
      <h1>@cujuju/solidjs-chip-flyout</h1>
      <p class="note">
        A filter chip that opens a panel of chips. Two modes: <b>tri-state</b> (each chip cycles
        unselected → included → excluded) and <b>multi</b> (a two-state toggle). It is the one
        floating surface in this toolkit that <b>gets scroll right</b> — see section 2.
      </p>
      <Code cap="usage">{`
import {
  ChipFlyout, EMPTY_TRI_STATE, type ChipOption, type TriStateValue,
} from '@cujuju/solidjs-chip-flyout';

const BROKERS: ChipOption[] = [{ id: 'ibkr', label: 'IBKR' }, …];
const [tri, setTri] = createSignal<TriStateValue>({ ...EMPTY_TRI_STATE });

<ChipFlyout
  mode="tri-state"                  // or "multi"
  label="Broker"
  panelTitle="Filter by broker"
  options={BROKERS}
  value={tri()}
  onChange={setTri}
  onOpenChange={(open) => …}
/>
`}</Code>

      <h2>1 · Variants</h2>
      <div class="row">
        <Card cap="tri-state — include / exclude, grouped options">
          <ChipFlyout
            mode="tri-state"
            label="Broker"
            panelTitle="Filter by broker"
            options={BROKERS}
            value={tri()}
            onChange={(next) => { setTri(next); log.log('onChange', next); }}
            onOpenChange={(o) => log.log('onOpenChange', o)}
          />
          <span class="readout">
            in <b>{tri().included.join(', ') || '—'}</b>
            <br />out <b>{tri().excluded.join(', ') || '—'}</b>
          </span>
        </Card>
        <Card cap="multi — plain toggle, sorted">
          <ChipFlyout
            mode="multi"
            label="Strategy"
            options={STRATEGIES}
            value={multi()}
            onChange={(next) => { setMulti(next); log.log('onChange', next); }}
            onOpenChange={(o) => log.log('onOpenChange', o)}
            sort
          />
          <span class="readout">selected <b>{multi().join(', ') || '—'}</b></span>
        </Card>
        <Card cap="disabled · loading · empty options">
          <ChipFlyout mode="multi" label="Disabled" options={STRATEGIES} value={[]} onChange={() => {}} disabled />
          <ChipFlyout mode="multi" label="Loading" options={[]} value={[]} onChange={() => {}} loading />
          <ChipFlyout mode="multi" label="No options" options={[]} value={[]} onChange={() => {}} />
        </Card>
        <Card cap="search + topSlot + hasMore/onLoadMore">
          <ChipFlyout
            mode="multi"
            label="Searchable"
            options={filtered()}
            value={multi()}
            onChange={(next) => { setMulti(next); log.log('onChange', next); }}
            searchValue={search()}
            onSearchInput={(next) => { setSearch(next); log.log('onSearchInput', next); }}
            hasMore
            onLoadMore={() => log.log('onLoadMore')}
            topSlot={<span class="readout">a caller-supplied top slot</span>}
            panelMinWidth={260}
          />
        </Card>
      </div>

      <h2>2 · Hostile ancestors</h2>
      <div class="row">
        <Card cap="overflow: hidden — escapes (top layer)">
          <ClipBox width="150px">
            <ChipFlyout mode="multi" label="Strategy" options={STRATEGIES} value={multi()} onChange={setMulti} />
          </ClipBox>
        </Card>
        <Card cap="✅ overflow-y: auto — open it, then scroll. It CLOSES.">
          <ScrollBox width="220px" height="160px">
            <div style={{ padding: '10px' }}>
              <ChipFlyout
                mode="multi"
                label="Strategy"
                options={STRATEGIES}
                value={multi()}
                onChange={setMulti}
                onOpenChange={(o) => log.log('onOpenChange', { open: o, box: 'scrollbox' })}
              />
            </div>
          </ScrollBox>
        </Card>
        <Card cap="right viewport edge — panel clamps" wide>
          <EdgeRight>
            <ChipFlyout
              mode="multi"
              label="Strategy"
              options={STRATEGIES}
              value={multi()}
              onChange={setMulti}
              placement="bottom-end"
              panelMinWidth={300}
            />
          </EdgeRight>
        </Card>
      </div>
      <p class="note">
        <b>This is the reference behaviour.</b> Open the flyout in the scroll box and scroll: it{' '}
        <b>dismisses</b>, and logs <code>onOpenChange false</code> as it does. It is the only
        floating package here that handles an outside scroll at all, because it is the only one
        that calls <code>createOutsideScrollDismiss</code> — the hook that already sits in{' '}
        <code>@cujuju/solidjs-hooks</code> and that <code>anchored-popover</code>,{' '}
        <code>select-flyout</code>, <code>editable-list-flyout</code> and <code>context-menu</code>{' '}
        all ignore. A scroll <i>inside</i> the panel (the option list) is correctly NOT treated as
        an outside scroll, so a long list still scrolls without closing itself.
      </p>

      <h2>3 · State &amp; dismiss</h2>
      <p class="note">
        Open state is <b>both</b>: omit <code>open</code> and the chip owns it; pass{' '}
        <code>open</code> + <code>onOpenChange</code> and you do. Exit paths: <b>Escape</b>,{' '}
        <b>outside pointerdown</b>, <b>the trigger chip</b> (toggles), <b>outside scroll</b>, and{' '}
        <b>programmatic</b>. Selecting a chip does <i>not</i> close the panel — deliberately, since
        a filter panel exists to set several chips at once. The log proves it: chip clicks emit{' '}
        <code>onChange</code> with no <code>onOpenChange</code> behind them.
      </p>
      <div class="row">
        <Card cap="controlled — the chip cannot open itself">
          <ChipFlyout
            mode="multi"
            label="Controlled"
            options={STRATEGIES}
            value={ctrlValue()}
            onChange={(next) => { setCtrlValue(next); log.log('onChange', next); }}
            open={ctrlOpen()}
            onOpenChange={(o) => { setCtrlOpen(o); log.log('onOpenChange', { controlled: o }); }}
          />
          <button class="demo-btn" onClick={() => setCtrlOpen((o) => !o)}>
            {ctrlOpen() ? 'close' : 'open'} from outside
          </button>
          <span class="readout">open <b>{String(ctrlOpen())}</b></span>
        </Card>
      </div>

      <h2>4 · Event log</h2>
      <div class="row">
        <EventLog
          log={log}
          hint="Clicking chips must emit onChange and NOT onOpenChange — a filter panel stays open. Scrolling the box must emit onOpenChange false."
        />
      </div>
    </>
  );
}
