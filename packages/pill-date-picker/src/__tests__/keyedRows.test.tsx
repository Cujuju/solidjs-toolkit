/**
 * The row list is keyed — a re-supplied ladder UPDATES rows. `<For>` reconciles by REFERENCE,
 * so every row was rebuilt per re-supply. DOM node identity is the honest assertion.
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

const NOW = new Date(2026, 5, 13); // Sat 13 Jun 2026
const rows = () => [...document.body.querySelectorAll('.cpdp-row')] as HTMLElement[];
const noteOf = (row: HTMLElement) =>
  (row.querySelector('.cpdp-row-note')?.textContent ?? null);

/** A caller's ladder entry: a date plus payload that changes as their data
 *  settles — the realistic shape, not a bare string. */
interface Entry {
  date: string;
  expId: string;
  note?: string;
}

const LADDER = (note?: (expId: string) => string | undefined): Entry[] =>
  ['2026-06-19', '2026-06-26', '2026-07-02'].map((date) => {
    const expId = `${date}~SPY`;
    const n = note?.(expId);
    // Fresh objects EVERY call — the whole point: this is what a refetch hands over.
    return n === undefined ? { date, expId } : { date, expId, note: n };
  });

describe('keyed rows', () => {
  it('keeps the same row elements when an equal ladder is re-supplied', () => {
    const [items, setItems] = createSignal<Entry[]>(LADDER());
    mount(() => (
      <PillDatePicker
        items={items()}
        keyOf={(e) => e.expId}
        value="2026-06-26~SPY"
        now={NOW}
        open
        onChange={() => {}}
      />
    ));

    const before = rows();
    expect(before).toHaveLength(3);

    // A refetch: same contracts, brand-new objects and a brand-new array.
    setItems(LADDER());

    const after = rows();
    expect(after).toHaveLength(3);
    // Not `toEqual` — IDENTITY. Rebuilt rows would be equal and still wrong.
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  /** Keeping the node must not mean keeping stale content — the row reads its
   *  item through the key, so fresh payload lands in the row that survived. */
  it('updates a surviving row from the re-supplied item', () => {
    const [items, setItems] = createSignal<Entry[]>(LADDER());
    mount(() => (
      <PillDatePicker
        items={items()}
        keyOf={(e) => e.expId}
        annotation={(e) => e.note}
        now={NOW}
        open
        onChange={() => {}}
      />
    ));

    const before = rows();
    expect(noteOf(before[1])).toBeNull();

    // The caller's data settled — same dates, new annotations.
    setItems(LADDER((expId) => (expId === '2026-06-26~SPY' ? 'adjusted' : undefined)));

    const after = rows();
    expect(after[1]).toBe(before[1]); // same node …
    expect(noteOf(after[1])).toBe('adjusted'); // … new content
  });

  /** A ladder that genuinely CHANGES still reconciles: the row for a dropped
   *  key goes, the rows that remain stay put. */
  it('drops only the rows whose keys left', () => {
    const [items, setItems] = createSignal<Entry[]>(LADDER());
    mount(() => (
      <PillDatePicker
        items={items()}
        keyOf={(e) => e.expId}
        now={NOW}
        open
        onChange={() => {}}
      />
    ));

    const before = rows();
    // The nearest expiration expired out of the chain.
    setItems(LADDER().slice(1));

    const after = rows();
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[2]);
  });
});

/**
 * `dteOf` — the caller's own DTE. The default derives it from the date, and a venue counts the
 * expiration day itself, so its number runs one HIGHER than the calendar difference.
 */
describe('dteOf', () => {
  const VENUE = (date: string): Entry => ({ date, expId: `${date}~SPY` });

  it('renders the callers DTE instead of the calendar difference', () => {
    // NOW is Sat 13 Jun; the 19th is 6 calendar days out, and a venue counting
    // the expiration day itself calls the same date 7.
    mount(() => (
      <PillDatePicker
        items={[VENUE('2026-06-19')]}
        keyOf={(e) => e.expId}
        dteOf={() => 7}
        now={NOW}
        open
        onChange={() => {}}
      />
    ));
    expect(rows()[0].querySelector('.cpdp-row-dte')?.textContent).toBe('7d');
  });

  it('falls back to calendar days when the caller supplies none', () => {
    mount(() => (
      <PillDatePicker
        items={[VENUE('2026-06-19')]}
        keyOf={(e) => e.expId}
        now={NOW}
        open
        onChange={() => {}}
      />
    ));
    expect(rows()[0].querySelector('.cpdp-row-dte')?.textContent).toBe('6d');
  });

  /** A null is "no DTE to show" — the same answer an unparseable date gives —
   *  not a zero, which would read as "expires today". */
  it('shows no DTE when the caller answers null', () => {
    mount(() => (
      <PillDatePicker
        items={[VENUE('2026-06-19')]}
        keyOf={(e) => e.expId}
        dteOf={() => null}
        now={NOW}
        open
        onChange={() => {}}
      />
    ));
    expect(rows()[0].querySelector('.cpdp-row-dte')?.textContent).not.toBe('0d');
  });
});
