import { For, createSignal, type JSX } from 'solid-js';
import { PillNumberPicker } from '@cujuju/solidjs-pill-number-picker';

/**
 * Playground — the live harness for the toolkit packages.
 *
 * Everything here is aimed at the cases that a unit test cannot show you and a static
 * mock cannot prove: how the control behaves inside HOSTILE ancestors (clipping,
 * scrolling), at the density it will actually ship in, with the real theme tokens.
 */

function Card(props: { cap: string; children: JSX.Element }) {
  return (
    <div class="card">
      <div class="cap">{props.cap}</div>
      <div class="body">{props.children}</div>
    </div>
  );
}

/** One picker with its own state — so every instance on the page is independently live. */
function Picker(props: {
  collapsible?: boolean;
  initial?: number;
  size?: 'xs' | 'sm' | 'md';
  editable?: boolean;
  max?: number;
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

export function App() {
  const [controlledOpen, setControlledOpen] = createSignal(false);
  const [controlledVal, setControlledVal] = createSignal(4);

  return (
    <>
      <h1>solidjs-toolkit — playground</h1>
      <p class="note">
        Packages are consumed <b>from source</b> through the workspace, so editing
        <code> packages/*/src </code> hot-reloads this page. No build, no publish, no linking
        into a consuming app.
      </p>

      <h2>
        pill-number-picker — collapse <small>(click a number)</small>
      </h2>
      <p class="note">
        Collapsed, the picker is the value alone and still steps on wheel + arrow keys.
        Click / Enter / Space expands it into a portalled pop-out.
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
        The hostile ancestors <small>— the reason the pop-out is portalled</small>
      </h2>
      <p class="note">
        Both boxes below would <b>clip</b> an in-flow expansion dead. Open a picker inside
        each: the panel escapes. In the scroll box, scroll while it is open — it tracks the
        anchor (fixed positioning + a captured scroll listener), because the container that
        moves is not <code>window</code>.
      </p>
      <div class="row">
        <Card cap="overflow: hidden, width 150px">
          <div class="clip">
            <Picker collapsible initial={7} size="sm" />
          </div>
        </Card>
        <Card cap="overflow-y: auto — scroll it while open">
          <div class="scrollbox">
            <For each={[...LEGS, ...LEGS]}>
              {(l) => <LegRow strike={l.strike} right={l.right} initial={l.initial} collapsible />}
            </For>
          </div>
        </Card>
        <Card cap="edge of the viewport — panel clamps, never leaves the screen">
          <div style={{ display: 'flex', 'justify-content': 'flex-end', width: '260px' }}>
            <Picker collapsible initial={42} size="sm" />
          </div>
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

      <h2>Placement — top by preference, flips when it must</h2>
      <p class="note">
        The picker at the very top of the page has no room above it, so its panel opens
        DOWNWARD. The one at the bottom opens upward. Resize the window to force the flip.
      </p>
      <div class="row">
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
          <span style={{ color: 'var(--text-muted)', font: '11px var(--mono)' }}>
            value {controlledVal()}
          </span>
        </Card>
        <Card cap="editable — click the value INSIDE the pop-out to type">
          <Picker collapsible initial={25} />
          <Picker collapsible initial={25} editable={false} />
        </Card>
      </div>

      <div class="tall" />
      <div class="row">
        <Card cap="bottom of the page — opens upward">
          <Picker collapsible initial={8} />
        </Card>
      </div>
    </>
  );
}
