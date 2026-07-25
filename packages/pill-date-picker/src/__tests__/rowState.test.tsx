/**
 * Per-row state (`itemState` / `annotation`) and the row escape hatch (`renderRow`).
 *
 * The styling is not what these prove — the INTERACTION is. A row the caller
 * marked unavailable must be impossible to commit down every route into
 * `commit()` (click, a click on something a custom row nested inside it, Enter
 * on a cursor that started there), and the keyboard cursor must never come to
 * rest anywhere Enter refuses to act. A control where the highlight and the
 * action disagree is worse than one with no highlight at all.
 *
 * Same harness conventions as PillDatePicker.test.tsx — hand-disposed `render`
 * from solid-js/web, never @solidjs/testing-library (two Solid instances leave
 * portalled panels alive across tests).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { PillDatePicker, type PillDateItemState, type PillDateRowContext } from '../PillDatePicker';

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

const NOW = new Date(2026, 5, 13); // Sat 13 Jun 2026
const LADDER = ['2026-06-19', '2026-06-26', '2026-07-02', '2026-07-17', '2026-09-18'];

const pill = (c: HTMLElement) => c.querySelector('.cpdp-pill') as HTMLButtonElement;
const rows = () => [...document.body.querySelectorAll('.cpdp-row')] as HTMLElement[];
const activeRow = () => document.body.querySelector('.cpdp-row[data-active]') as HTMLElement | null;
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (k: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const pointerEnter = (el: Element) =>
  el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }) as unknown as Event);

/** Marks the Jul 2 row adjusted and the Sep 18 row disabled — one of each, with
 *  available rows on both sides so cursor movement has somewhere to step. */
const STATE_OF = (item: string): PillDateItemState =>
  item === '2026-07-02' ? 'adjusted' : item === '2026-09-18' ? 'disabled' : 'available';

function Harness(props: {
  initial?: string | null;
  items?: readonly string[];
  itemState?: (item: string) => PillDateItemState;
  annotation?: (item: string) => string | undefined;
  renderRow?: (ctx: PillDateRowContext<string>) => any;
  onChange?: (item: string) => void;
}) {
  const [v, setV] = createSignal<string | null>(props.initial ?? null);
  return (
    <PillDatePicker
      items={props.items ?? LADDER}
      value={v()}
      onChange={(item) => {
        setV(item);
        props.onChange?.(item);
      }}
      now={NOW}
      itemState={props.itemState}
      annotation={props.annotation}
      renderRow={props.renderRow}
      ariaLabel="Expiration"
    />
  );
}

describe('itemState — what the row IS', () => {
  it('defaults every row to available, so an unstated ladder behaves as before', () => {
    const c = mount(() => <Harness />);
    click(pill(c));
    expect(rows().map((r) => r.dataset.state)).toEqual(['available', 'available', 'available', 'available', 'available']);
    expect(rows().some((r) => r.getAttribute('aria-disabled'))).toBe(false);
  });

  it('stamps the caller\'s state on the row, and announces disabled to a screen reader', () => {
    const c = mount(() => <Harness itemState={STATE_OF} />);
    click(pill(c));
    expect(rows().map((r) => r.dataset.state)).toEqual([
      'available', 'available', 'adjusted', 'available', 'disabled',
    ]);
    // aria-disabled, NOT removal: the row is unavailable, not absent, and a
    // ladder missing its unavailable dates misrepresents the calendar.
    expect(rows()[4].getAttribute('aria-disabled')).toBe('true');
    expect(rows()[2].getAttribute('aria-disabled')).toBeNull();
  });

  it('keeps an ADJUSTED row fully pickable — it is a caveat, not a refusal', () => {
    const picked = vi.fn();
    const c = mount(() => <Harness itemState={STATE_OF} onChange={picked} />);
    click(pill(c));
    click(rows()[2]); // Jul 2, adjusted
    expect(picked).toHaveBeenCalledWith('2026-07-02');
  });

  it('REFUSES to commit a disabled row on click, and stays open', () => {
    const picked = vi.fn();
    const c = mount(() => <Harness itemState={STATE_OF} onChange={picked} />);
    click(pill(c));
    click(rows()[4]); // Sep 18, disabled
    expect(picked).not.toHaveBeenCalled();
    // The panel must not close either — closing would look like the pick worked.
    expect(rows()).toHaveLength(5);
  });

  it('renders the caller\'s annotation, and only where they gave one', () => {
    const c = mount(() => (
      <Harness
        itemState={STATE_OF}
        annotation={(i) => (i === '2026-07-02' ? '≈ 145' : i === '2026-09-18' ? 'no puts' : undefined)}
      />
    ));
    click(pill(c));
    const notes = rows().map((r) => r.querySelector('.cpdp-row-note')?.textContent ?? null);
    expect(notes).toEqual([null, null, '≈ 145', null, 'no puts']);
  });
});

describe('the keyboard never rests where Enter refuses to act', () => {
  it('steps OVER a disabled row on ArrowDown', () => {
    const c = mount(() => <Harness itemState={STATE_OF} initial="2026-07-17" />);
    click(pill(c));
    // Cursor opens on the selection (index 3); the next row (4) is disabled, so
    // ArrowDown must wrap past it to row 0 rather than land on it.
    expect(activeRow()!.textContent).toContain('Jul 17');
    key('ArrowDown');
    expect(activeRow()!.textContent).toContain('Jun 19');
  });

  it('steps OVER a disabled row on ArrowUp', () => {
    const c = mount(() => <Harness itemState={STATE_OF} initial="2026-06-19" />);
    click(pill(c));
    key('ArrowUp'); // from row 0 backwards → row 4 is disabled → row 3
    expect(activeRow()!.textContent).toContain('Jul 17');
  });

  it('Home / End land on the first / last ENABLED row', () => {
    const c = mount(() => (
      // Both ends disabled, so a naive first/last would pick an inert row.
      <Harness itemState={(i) => (i === '2026-06-19' || i === '2026-09-18' ? 'disabled' : 'available')} />
    ));
    click(pill(c));
    key('End');
    expect(activeRow()!.textContent).toContain('Jul 17');
    key('Home');
    expect(activeRow()!.textContent).toContain('Jun 26');
  });

  it('a pointer over a disabled row does not move the cursor onto it', () => {
    const c = mount(() => <Harness itemState={STATE_OF} initial="2026-06-19" />);
    click(pill(c));
    pointerEnter(rows()[1]); // available → takes the cursor
    expect(activeRow()!.textContent).toContain('Jun 26');
    pointerEnter(rows()[4]); // disabled → cursor must not follow
    expect(activeRow()!.textContent).toContain('Jun 26');
  });

  it('with EVERY row disabled: nothing activates and Enter commits nothing', () => {
    const picked = vi.fn();
    const c = mount(() => <Harness itemState={() => 'disabled'} onChange={picked} />);
    click(pill(c));
    key('ArrowDown');
    expect(activeRow()).toBeNull(); // bounded scan settles on "nothing active"
    key('Enter');
    expect(picked).not.toHaveBeenCalled();
  });

  it('opening on a selection that has SINCE become disabled cannot be re-committed by Enter', () => {
    // The seeded cursor stays on the selection (moving it would make Enter pick
    // a value the user never chose) — so the commit guard is what must refuse.
    const picked = vi.fn();
    const c = mount(() => (
      <Harness itemState={(i) => (i === '2026-07-17' ? 'disabled' : 'available')} initial="2026-07-17" onChange={picked} />
    ));
    click(pill(c));
    expect(activeRow()!.textContent).toContain('Jul 17');
    key('Enter');
    expect(picked).not.toHaveBeenCalled();
    // ...and the first arrow key still moves to a usable row.
    key('ArrowDown');
    expect(activeRow()!.textContent).toContain('Sep 18');
  });
});

describe('renderRow — the escape hatch', () => {
  const custom = (ctx: PillDateRowContext<string>) => (
    <span class="my-row" data-state={ctx.state}>
      {ctx.label} · {ctx.dteLabel} · {ctx.annotation ?? '—'} · {String(ctx.selected)}
    </span>
  );

  it('replaces the row CONTENT and receives the package\'s own formatting', () => {
    const c = mount(() => (
      <Harness renderRow={custom} initial="2026-07-17" annotation={() => 'note'} />
    ));
    click(pill(c));
    const mine = document.body.querySelectorAll('.my-row');
    expect(mine).toHaveLength(5);
    // label + dteLabel come from the package (formatDate / DTE math), so a
    // custom row does not re-implement them.
    expect(mine[3].textContent).toBe('Jul 17 · 34d · note · true');
    // The built-in cells are gone — this is a replacement, not an addition.
    expect(document.body.querySelector('.cpdp-row-date')).toBeNull();
  });

  it('keeps the row ELEMENT — role, state attributes and click stay the package\'s', () => {
    const picked = vi.fn();
    const c = mount(() => <Harness renderRow={custom} itemState={STATE_OF} onChange={picked} />);
    click(pill(c));
    expect(rows()).toHaveLength(5);
    expect(rows()[0].getAttribute('role')).toBe('option');
    expect(rows()[2].dataset.state).toBe('adjusted');
    expect(rows()[4].getAttribute('aria-disabled')).toBe('true');
    click(rows()[1]);
    expect(picked).toHaveBeenCalledWith('2026-06-26');
  });

  it('cannot commit a disabled row even when the custom row nests its own button', () => {
    // The nested click bubbles into the SAME guarded handler — a custom row
    // cannot open a route around the refusal.
    const picked = vi.fn();
    const withButton = (ctx: PillDateRowContext<string>) => (
      <button type="button" class="inner">{ctx.label}</button>
    );
    const c = mount(() => <Harness renderRow={withButton} itemState={STATE_OF} onChange={picked} />);
    click(pill(c));
    const inner = [...document.body.querySelectorAll('.inner')] as HTMLElement[];
    click(inner[4]); // disabled row's own button
    expect(picked).not.toHaveBeenCalled();
    click(inner[1]); // available row's button still commits
    expect(picked).toHaveBeenCalledWith('2026-06-26');
  });

  it('reports the live cursor through ctx.active', () => {
    const c = mount(() => <Harness renderRow={(ctx) => <span class="my-row">{String(ctx.active)}</span>} />);
    click(pill(c));
    key('ArrowDown');
    const flags = [...document.body.querySelectorAll('.my-row')].map((e) => e.textContent);
    expect(flags).toEqual(['true', 'false', 'false', 'false', 'false']);
  });
});
