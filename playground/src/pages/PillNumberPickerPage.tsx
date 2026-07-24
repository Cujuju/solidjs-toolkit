import { For, createSignal, type JSX } from 'solid-js';
import { PillNumberPicker, type PnpLayout } from '@cujuju/solidjs-pill-number-picker';
import { Card, ClipBox, EdgeRight, ScrollBox, Tall } from '../ui';

/** Every arrangement of [value][+][−] the control supports. The `v-` prefixed two stack the
 *  buttons vertically beside the value. */
const LAYOUTS: PnpLayout[] = [
  'value-inc-dec',
  'value-dec-inc',
  'inc-value-dec',
  'dec-value-inc',
  'inc-dec-value',
  'dec-inc-value',
  'v-inc-value-dec',
  'v-dec-value-inc',
];

/** One picker with its own state — so every instance on the page is independently live. */
function Picker(props: {
  collapsible?: boolean;
  initial?: number;
  size?: 'xs' | 'sm' | 'md';
  editable?: boolean;
  max?: number;
  layout?: PnpLayout;
}) {
  const [v, setV] = createSignal(props.initial ?? 1);
  return (
    <PillNumberPicker
      collapsible={props.collapsible}
      value={v()}
      onChange={setV}
      min={1}
      max={props.max ?? 100}
      size={props.size}
      editable={props.editable}
      layout={props.layout}
      ariaLabel="Quantity"
    />
  );
}

/** A StockApp-shaped option leg: side chip (click flips), qty picker, strike. */
function LegRow(props: { strike: number; right: 'C' | 'P'; initial: number; collapsible?: boolean }) {
  const [side, setSide] = createSignal<'buy' | 'sell'>(props.initial > 0 ? 'buy' : 'sell');
  const [qty, setQty] = createSignal(Math.abs(props.initial));
  return (
    <div class="leg">
      <button
        class="side"
        data-side={side()}
        onClick={() => setSide((s) => (s === 'buy' ? 'sell' : 'buy'))}
        title="Flip side"
      >
        {side() === 'buy' ? 'BTO' : 'STO'}
      </button>
      <PillNumberPicker
        collapsible={props.collapsible}
        value={qty()}
        onChange={setQty}
        min={1}
        max={100}
        size="xs"
        ariaLabel="Contracts"
      />
      <span class="strike">
        {props.strike}
        {props.right}
      </span>
    </div>
  );
}

const LEGS: Array<{ strike: number; right: 'C' | 'P'; initial: number }> = [
  { strike: 6200, right: 'P', initial: 1 },
  { strike: 6250, right: 'P', initial: -1 },
  { strike: 6300, right: 'C', initial: -10 },
  { strike: 6350, right: 'C', initial: 1 },
];

export function PillNumberPickerPage(): JSX.Element {
  const [controlledOpen, setControlledOpen] = createSignal(false);
  const [controlledVal, setControlledVal] = createSignal(4);

  // commit: 'finish' — onChange still streams every keystroke/step for a live preview, but
  // onCommit fires ONLY when the user is done (blur / Enter / pop-out close). The difference
  // between "re-render a chart" and "send an order".
  const [limit, setLimit] = createSignal(412.5);
  const [committed, setCommitted] = createSignal(412.5);
  const [cancels, setCancels] = createSignal(0);

  const [pct, setPct] = createSignal(50);
  const [delta, setDelta] = createSignal(0);
  const [qty, setQty] = createSignal(0);

  return (
    <>
      <h1>@cujuju/solidjs-pill-number-picker</h1>
      <p class="note">
        Compact number stepper — 8 layouts, optional collapse-to-value with a portalled pop-out,
        auto-repeat with acceleration, a change/finish commit contract, formatted display, and
        spinbutton a11y.
      </p>

      <h2>
        collapse <small>(click a number)</small>
      </h2>
      <p class="note">
        Collapsed, the picker is the value alone and still steps on wheel + arrow keys. Click /
        Enter / Space expands it into a portalled pop-out.
      </p>
      <div class="row">
        <Card cap="collapsed vs expanded — md / sm / xs">
          <Picker collapsible initial={1} size="md" />
          <Picker collapsible initial={12} size="sm" />
          <Picker collapsible initial={100} size="xs" />
        </Card>
        <Card cap="not collapsible (the old default) — unchanged">
          <Picker initial={3} size="md" />
          <Picker initial={3} size="sm" />
          <Picker initial={3} size="xs" />
        </Card>
        <Card cap="never truncates — 1, 10, 100, max 100000">
          <Picker collapsible initial={1} />
          <Picker collapsible initial={10} />
          <Picker collapsible initial={100} />
          <Picker collapsible initial={100000} max={100000} />
        </Card>
      </div>

      <h2>
        Eight layouts <small>— where the buttons sit relative to the value</small>
      </h2>
      <p class="note">
        The default is <code>value-inc-dec</code>: value on the left, <code>[+]</code> then{' '}
        <code>[−]</code> on the right. The rest exist because a picker at the right edge of a
        dense row wants its buttons on the <i>left</i>, and a vertical stack (the two{' '}
        <code>v-</code> layouts) halves the horizontal footprint.
      </p>
      <div class="row">
        <For each={LAYOUTS}>
          {(l) => (
            <Card cap={l}>
              <Picker initial={4} layout={l} size="sm" />
            </Card>
          )}
        </For>
      </div>

      <h2>
        Formatting <small>— what the value LOOKS like is not what it IS</small>
      </h2>
      <div class="row">
        <Card cap="suffix + step + precision">
          <PillNumberPicker
            value={pct()}
            onChange={setPct}
            min={0}
            max={100}
            step={2.5}
            precision={1}
            suffix="%"
            ariaLabel="Allocation"
          />
          <span class="readout">
            raw <b>{pct()}</b>
          </span>
        </Card>
        <Card cap="zeroLabel — 0 is a state, not a number">
          <PillNumberPicker
            value={delta()}
            onChange={setDelta}
            min={-5}
            max={5}
            zeroLabel="flat"
            ariaLabel="Delta"
          />
          <span class="readout">
            raw <b>{delta()}</b>
          </span>
        </Card>
        <Card cap="displayValue — a full formatter">
          <PillNumberPicker
            value={qty()}
            onChange={setQty}
            min={-10}
            max={10}
            displayValue={(v) => (v > 0 ? `long ${v}` : v < 0 ? `short ${-v}` : '—')}
            width={92}
            ariaLabel="Position"
          />
          <span class="readout">
            raw <b>{qty()}</b>
          </span>
        </Card>
        <Card cap="showRange + rangeFormat">
          <PillNumberPicker
            value={pct()}
            onChange={setPct}
            min={0}
            max={100}
            showRange
            rangeFormat={(v, min, max) => `${v} of ${min}–${max}`}
            ariaLabel="With range"
          />
        </Card>
      </div>

      <h2>
        The commit contract <small>— change vs finish</small>
      </h2>
      <p class="note">
        <code>commit: 'change'</code> (default) means every step IS the value. Fine for a chart
        setting; wrong for a limit price, where an intermediate keystroke would fire a request per
        digit. With <code>commit: 'finish'</code>, <code>onChange</code> still streams for a live
        preview, but <code>onCommit</code> fires only on blur / Enter / pop-out close — and{' '}
        <b>Escape</b> reverts to the last committed value and calls <code>onCancel</code>.
      </p>
      <div class="row">
        <Card cap="commit: 'finish' — type, then Enter (commit) or Escape (revert)">
          <PillNumberPicker
            collapsible
            value={limit()}
            onChange={setLimit}
            commit="finish"
            onCommit={setCommitted}
            onCancel={() => setCancels((n) => n + 1)}
            revertOnCancel
            min={0}
            max={1000}
            step={0.05}
            precision={2}
            editable
            width={80}
            ariaLabel="Limit price"
          />
          <span class="readout">
            live <b>{limit().toFixed(2)}</b>
            <br />
            committed <b>{committed().toFixed(2)}</b>
            <br />
            reverted <b>{cancels()}</b> times
          </span>
        </Card>
      </div>

      <h2>The hostile ancestors</h2>
      <p class="note">
        Both boxes below would <b>clip</b> an in-flow expansion dead. Open a picker inside each:
        the panel escapes. In the scroll box, scroll while it is open — it tracks the anchor
        (fixed positioning + a captured scroll listener), because the container that moves is not{' '}
        <code>window</code>.
      </p>
      <div class="row">
        <Card cap="overflow: hidden, width 150px">
          <ClipBox>
            <Picker collapsible initial={7} size="sm" />
          </ClipBox>
        </Card>
        <Card cap="overflow-y: auto — scroll it while open">
          <ScrollBox>
            <For each={[...LEGS, ...LEGS]}>
              {(l) => <LegRow strike={l.strike} right={l.right} initial={l.initial} collapsible />}
            </For>
          </ScrollBox>
        </Card>
        <Card cap="edge of the viewport — panel clamps, never leaves the screen">
          <EdgeRight>
            <Picker collapsible initial={42} size="sm" />
          </EdgeRight>
        </Card>
      </div>

      <h2>
        In situ — the StockApp leg row <small>(the density it must survive)</small>
      </h2>
      <p class="note">
        Left: collapsed qty. Right: the full picker, as it ships today. The side chip flips
        BTO/STO on click. Note how much of the row the expanded picker's chrome eats.
      </p>
      <div class="row">
        <Card cap="collapsed qty">
          <div style={{ width: '190px' }}>
            <For each={LEGS}>
              {(l) => <LegRow strike={l.strike} right={l.right} initial={l.initial} collapsible />}
            </For>
          </div>
        </Card>
        <Card cap="full picker (today)">
          <div style={{ width: '190px' }}>
            <For each={LEGS}>
              {(l) => <LegRow strike={l.strike} right={l.right} initial={l.initial} />}
            </For>
          </div>
        </Card>
      </div>

      <h2>Input behaviour</h2>
      <div class="row">
        <Card cap="auto-repeat with acceleration — hold [+] down">
          <PillNumberPicker
            value={pct()}
            onChange={setPct}
            min={0}
            max={100}
            autoRepeatDelay={300}
            autoRepeatInterval={60}
            autoRepeatAcceleration
            ariaLabel="Accelerating"
          />
          <span class="readout">
            it speeds up the longer you hold
          </span>
        </Card>
        <Card cap="disableWheel — scroll over it, nothing happens">
          <PillNumberPicker
            value={pct()}
            onChange={setPct}
            min={0}
            max={100}
            disableWheel
            ariaLabel="No wheel"
          />
        </Card>
        <Card cap="requireFocus — wheel only works once you click it">
          <PillNumberPicker
            value={pct()}
            onChange={setPct}
            min={0}
            max={100}
            requireFocus
            ariaLabel="Focus-gated wheel"
          />
        </Card>
        <Card cap="invertScroll — wheel-up decrements">
          <PillNumberPicker
            value={pct()}
            onChange={setPct}
            min={0}
            max={100}
            invertScroll
            ariaLabel="Inverted"
          />
        </Card>
      </div>
      <p class="note">
        <code>requireFocus</code> is the one to reach for inside a scrolling list: an unfocused
        picker that eats the wheel event traps the user's scroll on a control they were only
        passing over.
      </p>

      <h2>Chrome</h2>
      <div class="row">
        <Card cap="custom increment / decrement icons">
          <PillNumberPicker
            value={qty()}
            onChange={setQty}
            min={-10}
            max={10}
            incrementIcon={<span style={{ color: 'var(--green)' }}>▲</span>}
            decrementIcon={<span style={{ color: 'var(--red)' }}>▼</span>}
            ariaLabel="Arrows"
          />
        </Card>
        <Card cap="geometry — width / height / buttonWidth / fontSize">
          <PillNumberPicker
            value={qty()}
            onChange={setQty}
            min={-10}
            max={10}
            width={120}
            height={30}
            buttonWidth={30}
            fontSize={15}
            ariaLabel="Chunky"
          />
        </Card>
        <Card cap="disabled">
          <PillNumberPicker value={5} onChange={() => {}} disabled ariaLabel="Disabled" />
        </Card>
        <Card cap="controlled open state">
          <PillNumberPicker
            collapsible
            open={controlledOpen()}
            onOpenChange={setControlledOpen}
            value={controlledVal()}
            onChange={setControlledVal}
            min={1}
            max={100}
            ariaLabel="Controlled"
          />
          <button class="side" data-side="buy" onClick={() => setControlledOpen((o) => !o)}>
            {controlledOpen() ? 'close' : 'open'} from outside
          </button>
          <span class="readout">
            value <b>{controlledVal()}</b>
          </span>
        </Card>
        <Card cap="editable — click the value INSIDE the pop-out to type">
          <Picker collapsible initial={25} />
          <Picker collapsible initial={25} editable={false} />
        </Card>
      </div>

      <h2>Placement — top by preference, flips when it must</h2>
      <p class="note">
        The picker at the bottom of this page has no room below it, so its pop-out opens upward.
        Resize the window to force the flip.
      </p>
      <Tall />
      <div class="row">
        <Card cap="bottom of the page — opens upward">
          <Picker collapsible initial={8} />
        </Card>
      </div>
    </>
  );
}
