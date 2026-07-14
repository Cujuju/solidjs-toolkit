/**
 * The BEHAVIOUR, not the geometry.
 *
 * `popout.test.ts` proves the placement math and `dte.test.ts` proves the number. Neither can
 * prove the things that actually break: that the collapsed pill hides the DTE, that expanding
 * escapes a clipping ancestor, that selecting hands back the caller's ORIGINAL object, that
 * the thing can be dismissed at all.
 *
 * Rendered with `render` from `solid-js/web` and disposed by hand — the toolkit's own pattern
 * (see pill-number-picker's collapse.test.tsx, ContextMenu.test.tsx). NOT
 * `@solidjs/testing-library`: it resolves its own copy of Solid, and two Solid instances means
 * two ownership graphs — its `cleanup()` disposes the root IT created while the component's
 * <Portal> belongs to the other one, so pop-outs survive teardown and the next test silently
 * queries a stale panel.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { PillDatePicker } from '../PillDatePicker';

let dispose: (() => void) | null = null;

function mount(ui: () => any): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
  return host;
}

afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

/** A pinned clock, so every DTE below is a fixed number and not a function of the test run. */
const NOW = new Date(2026, 5, 13); // Sat 13 Jun 2026

/** A realistic ladder: the next few weeklies, then the monthlies. */
const LADDER = ['2026-06-19', '2026-06-26', '2026-07-02', '2026-07-17', '2026-09-18'];

/** DTE from NOW, for reference: Jun 19 = 6, Jun 26 = 13, Jul 2 = 19, Jul 17 = 34, Sep 18 = 97. */

// ── DOM vocabulary — assert the contract, not the markup. ────────────────────
const pill = (c: HTMLElement) => c.querySelector('.cpdp-pill') as HTMLButtonElement;
/** The pop-out is PORTALLED, so it is NOT under the host — look at the document. */
const panel = () => document.body.querySelector('.cpdp-popout') as HTMLElement | null;
const panels = () => document.body.querySelectorAll('.cpdp-popout');
const rows = () => [...document.body.querySelectorAll('.cpdp-row')] as HTMLElement[];
const rowText = (r: HTMLElement) => ({
  date: (r.querySelector('.cpdp-row-date') as HTMLElement).textContent,
  dte: (r.querySelector('.cpdp-row-dte') as HTMLElement).textContent,
});
const tooltip = () => document.body.querySelector('.ckv-panel') as HTMLElement | null;

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (el: EventTarget, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const pointerDown = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }) as unknown as Event);
const mouseEnter = (el: Element) =>
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
const mouseMove = (el: Element) =>
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }));

function Harness(props: { initial?: string | null; items?: readonly string[] }) {
  const [v, setV] = createSignal<string | null>(props.initial ?? null);
  return (
    <PillDatePicker
      items={props.items ?? LADDER}
      value={v()}
      onChange={(item) => setV(item)}
      now={NOW}
      ariaLabel="Expiration"
    />
  );
}

describe('collapsed', () => {
  it('shows ONLY the day + month — the DTE is what the tooltip is for', () => {
    const c = mount(() => <Harness initial="2026-07-17" />);
    expect(pill(c).textContent).toBe('Jul 17');
    expect(pill(c).textContent).not.toContain('d');
    expect(panel()).toBeNull();
  });

  it('shows the placeholder when nothing is selected', () => {
    const c = mount(() => <Harness />);
    expect(pill(c).textContent).toBe('Select');
    expect(pill(c).dataset.empty).toBe('true');
  });

  it('surfaces the DTE (and the long date) in a hover tooltip', () => {
    const c = mount(() => <Harness initial="2026-07-17" />);
    expect(tooltip()).toBeNull();

    // KvTooltip is a hover WRAPPER — the listener is on the span it wraps the pill in.
    const wrap = c.querySelector('.cpdp-trigger-wrap') as HTMLElement;
    mouseEnter(wrap);
    mouseMove(wrap);

    const t = tooltip();
    expect(t).not.toBeNull();
    expect(t!.textContent).toContain('Jul 17, 2026');
    expect(t!.textContent).toContain('34d');
  });

  it('has NO tooltip content when nothing is selected — there is nothing to describe', () => {
    const c = mount(() => <Harness />);
    const wrap = c.querySelector('.cpdp-trigger-wrap') as HTMLElement;
    mouseEnter(wrap);
    mouseMove(wrap);
    expect(tooltip()).toBeNull();
  });

  it('suppresses the tooltip while the ladder is open — the panel already shows every DTE', () => {
    const c = mount(() => <Harness initial="2026-07-17" />);
    click(pill(c));
    const wrap = c.querySelector('.cpdp-trigger-wrap') as HTMLElement;
    mouseEnter(wrap);
    mouseMove(wrap);
    expect(tooltip()).toBeNull();
  });
});

describe('expanded', () => {
  it('lists every expiration with BOTH its DTE and its date', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    expect(panel()).not.toBeNull();
    expect(rows().length).toBe(LADDER.length);
    expect(rowText(rows()[0])).toEqual({ date: 'Jun 19', dte: '6d' });
    expect(rowText(rows()[3])).toEqual({ date: 'Jul 17', dte: '34d' });
    expect(rowText(rows()[4])).toEqual({ date: 'Sep 18', dte: '97d' });
  });

  it('PORTALS the panel out of the root — the reason the control works at all', () => {
    // An in-flow expansion is clipped dead by any overflow:hidden / overflow-y:auto ancestor,
    // which is exactly the dense layout this exists for.
    const c = mount(() => (
      <div style={{ overflow: 'hidden', width: '60px' }}>
        <Harness />
      </div>
    ));
    click(pill(c));
    const p = panel();
    expect(p).not.toBeNull();
    expect(c.contains(p)).toBe(false);
  });

  it('marks the current selection', () => {
    const c = mount(() => <Harness initial="2026-07-02" />);
    click(pill(c));
    const selected = rows().filter((r) => r.dataset.selected === 'true');
    expect(selected.length).toBe(1);
    expect(rowText(selected[0]).date).toBe('Jul 2');
    expect(selected[0].getAttribute('aria-selected')).toBe('true');
  });

  it('a second click on the pill closes it', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    expect(panel()).not.toBeNull();
    click(pill(c));
    expect(panel()).toBeNull();
  });

  it('renders an empty message rather than a bare box when there are no expirations', () => {
    const c = mount(() => <Harness items={[]} />);
    click(pill(c));
    expect(rows().length).toBe(0);
    expect(panel()!.textContent).toContain('No expirations');
  });

  it('DISPOSES the panel when the picker unmounts — no orphan left in <body>', () => {
    // A consumer that unmounts a row while its picker is open (a keyed <For> rebuilding its
    // list, say) must not leak a floating panel into the document forever.
    const c = mount(() => <Harness />);
    click(pill(c));
    expect(panels().length).toBe(1);
    dispose?.();
    dispose = null;
    expect(panels().length).toBe(0);
  });
});

describe('select', () => {
  it('selecting a row updates the pill and CLOSES the pop-out', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    click(rows()[3]);
    expect(panel()).toBeNull();
    expect(pill(c).textContent).toBe('Jul 17');
  });

  it('hands back the ORIGINAL item — payload keys survive the round trip', () => {
    // The whole point of accepting the object form. A caller who hangs their own data off an
    // expiration must get that data back, not a reconstructed `{ date }` shell.
    interface Expiry { date: string; oi: number; monthly: boolean }
    const items: Expiry[] = [
      { date: '2026-06-19', oi: 12_400, monthly: false },
      { date: '2026-07-17', oi: 98_100, monthly: true },
    ];
    const seen: Expiry[] = [];
    const c = mount(() => (
      <PillDatePicker
        items={items}
        value={null}
        onChange={(item) => seen.push(item)}
        now={NOW}
      />
    ));
    click(pill(c));
    click(rows()[1]);

    expect(seen.length).toBe(1);
    // Identity, not just shape — a copy would pass a deep-equal check and still have lost a
    // caller's non-enumerable or class-instance payload.
    expect(seen[0]).toBe(items[1]);
    expect(seen[0].oi).toBe(98_100);
    expect(seen[0].monthly).toBe(true);
  });

  it('renders the object form exactly like the string form', () => {
    const c = mount(() => (
      <PillDatePicker
        items={[{ date: '2026-07-17', oi: 1 }]}
        value="2026-07-17"
        onChange={() => {}}
        now={NOW}
      />
    ));
    expect(pill(c).textContent).toBe('Jul 17');
  });
});

describe('keyboard', () => {
  it('opens from the keyboard (Enter, Space, ArrowDown) — or the ladder is mouse-only', () => {
    for (const k of ['Enter', ' ', 'ArrowDown']) {
      const c = mount(() => <Harness />);
      key(pill(c), k);
      expect(panel(), `"${k}" did not open the picker`).not.toBeNull();
      dispose?.();
      dispose = null;
      document.body.innerHTML = '';
    }
  });

  it('walks the list with the arrows and commits with Enter', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    key(document, 'ArrowDown'); // -> row 0
    key(document, 'ArrowDown'); // -> row 1
    expect(rows()[1].dataset.active).toBe('true');
    key(document, 'Enter');
    expect(panel()).toBeNull();
    expect(pill(c).textContent).toBe('Jun 26');
  });

  it('opens with the CURRENT selection under the cursor, so Enter is not a surprise', () => {
    const c = mount(() => <Harness initial="2026-07-17" />);
    click(pill(c));
    expect(rows()[3].dataset.active).toBe('true');
    key(document, 'Enter');
    expect(pill(c).textContent).toBe('Jul 17'); // unchanged — Enter re-picked what was there
  });

  it('wraps at both ends rather than dead-ending', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    key(document, 'ArrowUp'); // from nothing-active, Up seeds the LAST row
    expect(rows()[LADDER.length - 1].dataset.active).toBe('true');
    key(document, 'ArrowDown'); // wraps to the first
    expect(rows()[0].dataset.active).toBe('true');
  });

  it('Home and End jump to the ends', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    key(document, 'End');
    expect(rows()[LADDER.length - 1].dataset.active).toBe('true');
    key(document, 'Home');
    expect(rows()[0].dataset.active).toBe('true');
  });
});

describe('dismiss', () => {
  it('dismisses on an outside pointerdown', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    pointerDown(outside);
    expect(panel()).toBeNull();
  });

  it('does NOT dismiss on a pointerdown INSIDE the panel', () => {
    // Otherwise the panel would close the instant you reached for a row.
    const c = mount(() => <Harness />);
    click(pill(c));
    pointerDown(rows()[0]);
    expect(panel()).not.toBeNull();
  });

  it('dismisses on Escape', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    key(document, 'Escape');
    expect(panel()).toBeNull();
  });

  it('leaves the selection alone when dismissed without picking', () => {
    const c = mount(() => <Harness initial="2026-07-17" />);
    click(pill(c));
    key(document, 'Escape');
    expect(pill(c).textContent).toBe('Jul 17');
  });
});

describe('open state', () => {
  it('honours a CONTROLLED open state', () => {
    const [open, setOpen] = createSignal(false);
    mount(() => (
      <PillDatePicker
        items={LADDER}
        value={null}
        onChange={() => {}}
        now={NOW}
        open={open()}
        onOpenChange={setOpen}
      />
    ));
    expect(panel()).toBeNull();
    setOpen(true);
    expect(panel()).not.toBeNull();
    setOpen(false);
    expect(panel()).toBeNull();
  });

  it('reports open-state changes to onOpenChange', () => {
    const seen: boolean[] = [];
    const c = mount(() => (
      <PillDatePicker
        items={LADDER}
        value={null}
        onChange={() => {}}
        now={NOW}
        onOpenChange={(o) => seen.push(o)}
      />
    ));
    click(pill(c));
    key(document, 'Escape');
    expect(seen).toEqual([true, false]);
  });

  it('reflects open state in aria-expanded', () => {
    const c = mount(() => <Harness />);
    expect(pill(c).getAttribute('aria-expanded')).toBe('false');
    click(pill(c));
    expect(pill(c).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('DTE colour', () => {
  it('colours each row from the ramp', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    // Distinct bands: 6d (urgent, <= 7) vs 34d (far, > 30). Whatever the tokens resolve to,
    // the two must not be the same colour or the ramp is doing nothing.
    const urgent = rows()[0].querySelector('.cpdp-row-dte') as HTMLElement;
    const far = rows()[3].querySelector('.cpdp-row-dte') as HTMLElement;
    expect(urgent.style.color).not.toBe('');
    expect(urgent.style.color).not.toBe(far.style.color);
  });

  it('takes a caller-supplied ramp — the package ships no palette opinion', () => {
    const c = mount(() => (
      <PillDatePicker
        items={LADDER}
        value={null}
        onChange={() => {}}
        now={NOW}
        dteRamp={[
          { maxDte: 7, color: 'rgb(255, 0, 0)' },
          { maxDte: Number.POSITIVE_INFINITY, color: 'rgb(0, 0, 255)' },
        ]}
      />
    ));
    click(pill(c));
    const dteOf = (i: number) =>
      (rows()[i].querySelector('.cpdp-row-dte') as HTMLElement).style.color;
    expect(dteOf(0)).toBe('rgb(255, 0, 0)'); // 6d
    expect(dteOf(3)).toBe('rgb(0, 0, 255)'); // 34d
  });
});
