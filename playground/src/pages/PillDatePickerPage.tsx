import { For, createSignal, type JSX } from 'solid-js';
import { PillDatePicker } from '@cujuju/solidjs-pill-date-picker';
import { Code, Card, ClipBox, EdgeRight, ScrollBox, Tall } from '../ui';

/**
 * A realistic expiration ladder, built off the REAL today so the DTEs on screen are live.
 *
 * Weeklies (the next four Fridays) then monthlies (the third Friday of the next four months)
 * then one LEAPS — the shape of an actual chain, which is what the control has to survive.
 * Anything the picker does with a made-up flat list is uninteresting.
 */
function iso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const FRIDAY = 5;

function nextFridays(from: Date, count: number): string[] {
  const out: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // Step to the next Friday (or today, if today IS Friday — a 0-DTE entry is a real thing
  // and the ramp should paint it as such).
  d.setDate(d.getDate() + ((FRIDAY - d.getDay() + 7) % 7));
  for (let i = 0; i < count; i++) {
    out.push(iso(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

/** Third Friday of a month — the standard US equity/index monthly expiration. */
function thirdFriday(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const firstFriday = 1 + ((FRIDAY - first.getDay() + 7) % 7);
  return new Date(year, month, firstFriday + 14);
}

interface Expiry {
  date: string;
  kind: 'weekly' | 'monthly' | 'leaps';
  /** Caller payload — proves the object form round-trips through onChange untouched. */
  oi: number;
}

function buildLadder(now: Date): Expiry[] {
  const weeklies: Expiry[] = nextFridays(now, 4).map((date, i) => ({
    date,
    kind: 'weekly',
    oi: 4_000 + i * 1_700,
  }));
  const monthlies: Expiry[] = [];
  for (let i = 1; i <= 4; i++) {
    const d = thirdFriday(now.getFullYear(), now.getMonth() + i);
    monthlies.push({ date: iso(d), kind: 'monthly', oi: 40_000 + i * 9_000 });
  }
  const leaps: Expiry = {
    date: iso(thirdFriday(now.getFullYear() + 1, 0)),
    kind: 'leaps',
    oi: 121_000,
  };
  // De-dup: a weekly Friday that IS the third Friday is the same contract, listed once.
  const seen = new Set<string>();
  return [...weeklies, ...monthlies, leaps].filter((e) => {
    if (seen.has(e.date)) return false;
    seen.add(e.date);
    return true;
  });
}

const LADDER = buildLadder(new Date());
const DATES = LADDER.map((e) => e.date);

/** One picker with its own state, so every instance on the page is independently live. */
function Picker(props: {
  size?: 'xs' | 'sm' | 'md';
  initial?: string | null;
  disabled?: boolean;
  items?: readonly string[];
}) {
  const [v, setV] = createSignal<string | null>(props.initial ?? null);
  return (
    <PillDatePicker
      items={props.items ?? DATES}
      value={v()}
      onChange={setV}
      size={props.size}
      disabled={props.disabled}
      ariaLabel="Expiration"
    />
  );
}

/** A chain-header row: the picker next to the things it actually sits beside. */
function ChainHeader(props: { symbol: string }) {
  const [v, setV] = createSignal<string | null>(DATES[1] ?? null);
  return (
    <div class="leg">
      <span class="strike" style={{ 'margin-left': '0' }}>{props.symbol}</span>
      <PillDatePicker
        items={DATES}
        value={v()}
        onChange={setV}
        size="xs"
        ariaLabel="Expiration"
      />
    </div>
  );
}

export function PillDatePickerPage(): JSX.Element {
  const [payloadPick, setPayloadPick] = createSignal<Expiry | null>(null);
  const [controlledOpen, setControlledOpen] = createSignal(false);
  const [controlledVal, setControlledVal] = createSignal<string | null>(DATES[3] ?? null);

  return (
    <>
      <h1>@cujuju/solidjs-pill-date-picker</h1>
      <p class="note">
        An expiration picker. The caller supplies the dates; the control computes the DTE and
        renders it. Collapsed it is the date alone (<code>Jul 17</code>) with the DTE in a
        hover tooltip; expanded it is a portalled ladder showing both. The ladder below is
        built off the real today, so the DTEs are live.
      </p>
      <Code cap="usage">{`
import { PillDatePicker } from '@cujuju/solidjs-pill-date-picker';
import '@cujuju/solidjs-pill-date-picker/styles.css';

const DATES = [{ value: '2026-08-21', label: 'Aug 21', dte: 29 }, …];
const [v, setV] = createSignal(DATES[0].value);

<PillDatePicker
  items={DATES}
  value={v()}
  onChange={setV}
  size="md"            // xs | sm | md
  ariaLabel="Expiration"
/>
`}</Code>

      <h2>
        Collapsed vs expanded <small>(hover a pill for the DTE; click to open the ladder)</small>
      </h2>
      <p class="note">
        The collapsed pill deliberately shows <b>only</b> the day + month — DTE is the thing you
        want <i>sometimes</i>, and paying for it on every row of a dense chain is the tax this
        control exists to avoid. Hover surfaces it (via
        <code> @cujuju/solidjs-kv-tooltip</code>); expanding surfaces all of them at once.
      </p>
      <div class="row">
        <Card cap="md / sm / xs — the sibling number-picker's rhythm">
          <Picker size="md" initial={DATES[3]} />
          <Picker size="sm" initial={DATES[3]} />
          <Picker size="xs" initial={DATES[3]} />
        </Card>
        <Card cap="unselected (placeholder) — and disabled">
          <Picker />
          <Picker initial={DATES[0]} disabled />
        </Card>
        <Card cap="empty list — an honest message, not a bare box">
          <Picker items={[]} />
        </Card>
      </div>

      <h2>
        The DTE ramp <small>— urgency colour is a PROP, not a palette we ship</small>
      </h2>
      <p class="note">
        Default bands are calendar boundaries: today (<code>0</code>), this week
        (<code>&le;7</code>), this month (<code>&le;30</code>), beyond. They resolve to
        <code> --pdp-dte-*</code> tokens, so re-theming needs no prop at all. The card on the
        right passes its own ramp — the thresholds and the colours are a house opinion, and the
        package does not get to hold one.
      </p>
      <div class="row">
        <Card cap="default ramp (open it)">
          <Picker initial={DATES[0]} />
        </Card>
        <Card cap="caller ramp — 2 bands, 14d cutoff">
          <PillDatePicker
            items={DATES}
            value={DATES[0]}
            onChange={() => {}}
            dteRamp={[
              { maxDte: 14, color: 'var(--red)' },
              { maxDte: Number.POSITIVE_INFINITY, color: 'var(--green)' },
            ]}
            ariaLabel="Expiration"
          />
        </Card>
      </div>

      <h2>
        Caller payload survives the round trip <small>(the object form)</small>
      </h2>
      <p class="note">
        <code>items</code> takes bare ISO strings <i>or</i> objects with a <code>date</code> key
        plus whatever else you want to hang off them. <code>onChange</code> hands back the
        ORIGINAL item — by reference, not a copy — so the payload (here: open interest and a
        weekly/monthly flag) is still there, still typed. The tooltip below is built from it.
      </p>
      <div class="row">
        <Card cap="objects in, objects out">
          <PillDatePicker
            items={LADDER}
            value={payloadPick()?.date ?? null}
            onChange={setPayloadPick}
            tooltipEntries={(item, dte) => ({
              Expires: item.date,
              DTE: dte === null ? '—' : `${dte}d`,
              Kind: item.kind,
              OI: item.oi.toLocaleString(),
            })}
            ariaLabel="Expiration"
          />
          <span class="readout">
            {payloadPick()
              ? (
                <>
                  picked <b>{payloadPick()!.date}</b> · kind <b>{payloadPick()!.kind}</b> · oi{' '}
                  <b>{payloadPick()!.oi.toLocaleString()}</b>
                </>
              )
              : 'nothing picked yet'}
          </span>
        </Card>
        <Card cap="controlled open state">
          <PillDatePicker
            items={DATES}
            value={controlledVal()}
            onChange={setControlledVal}
            open={controlledOpen()}
            onOpenChange={setControlledOpen}
            ariaLabel="Controlled expiration"
          />
          <button class="demo-btn" onClick={() => setControlledOpen((o) => !o)}>
            {controlledOpen() ? 'close' : 'open'} from outside
          </button>
        </Card>
      </div>

      <h2>
        The hostile ancestors <small>— the reason the ladder is portalled</small>
      </h2>
      <p class="note">
        Both boxes would <b>clip</b> an in-flow expansion dead. Open a picker inside each: the
        panel escapes. In the scroll box, <b>scroll while the ladder is open</b> — it tracks the
        anchor, because the scroll listener is CAPTURING and the thing that moves is not
        <code> window</code>. At the right edge, a panel wider than its pill clamps instead of
        walking off-screen.
      </p>
      <div class="row">
        <Card cap="overflow: hidden, width 130px">
          <ClipBox width="130px">
            <Picker size="sm" initial={DATES[2]} />
          </ClipBox>
        </Card>
        <Card cap="overflow-y: auto — scroll it while open">
          <ScrollBox width="200px" height="150px">
            <For each={['SPX', 'QQQ', 'NVDA', 'TSLA', 'AAPL', 'MSFT']}>
              {(s) => <ChainHeader symbol={s} />}
            </For>
          </ScrollBox>
        </Card>
        <Card cap="edge of the viewport — panel clamps">
          <EdgeRight>
            <Picker size="sm" initial={DATES[1]} />
          </EdgeRight>
        </Card>
      </div>

      <h2>Placement — bottom by preference, flips when it must</h2>
      <p class="note">
        A list reads downward from its trigger, so this one prefers to open BELOW — the opposite
        of the number-picker's stepper pop-out, which prefers above so it does not cover the next
        row. The picker at the bottom of this page has no room below it and flips upward. Resize
        the window to force the flip either way.
      </p>
      <Tall />
      <div class="row">
        <Card cap="bottom of the page — opens upward">
          <Picker initial={DATES[4]} />
        </Card>
        <Card cap="preferPlacement='top' — forced, even with room below">
          <PillDatePicker
            items={DATES}
            value={DATES[0]}
            onChange={() => {}}
            preferPlacement="top"
            ariaLabel="Expiration"
          />
        </Card>
      </div>
    </>
  );
}
