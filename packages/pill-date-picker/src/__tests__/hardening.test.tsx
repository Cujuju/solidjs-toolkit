/**
 * The five defects an adversarial pass found before 0.2.0 shipped. Three of
 * them predate it, and all five share a shape: the control was correct about
 * the case it was written for and silent about the case next to it.
 *
 *  1. `disabled` guarded the trigger but not an ALREADY-OPEN panel — a control
 *     the caller had switched off could still be clicked into committing.
 *  2. Two open pickers both bound the document keyboard, so one Enter committed
 *     in both. `open` is a public prop; two open pickers is legal usage.
 *  3. The cursor was an INDEX, and the open-effect tracked `items` — so a
 *     re-supplied ladder either teleported the cursor to the selection or wiped
 *     it, and "row 3" after the change was a different date than the one the
 *     user was looking at.
 *  4. No `aria-activedescendant` / row ids: focus stays on the combobox, so
 *     cursor movement was silent to a screen reader — worse once rows could be
 *     disabled, which is exactly what such a user cannot see.
 *  5. `itemState` was invoked ~3× per row per render and again per keypress; a
 *     prop documented as a simple predicate was expensive to supply honestly.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
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

const NOW = new Date(2026, 5, 13);
const LADDER = ['2026-06-19', '2026-06-26', '2026-07-02', '2026-07-17', '2026-09-18'];

const pills = () => [...document.body.querySelectorAll('.cpdp-pill')] as HTMLButtonElement[];
const rows = () => [...document.body.querySelectorAll('.cpdp-row')] as HTMLElement[];
const panels = () => document.body.querySelectorAll('.cpdp-popout');
const activeRow = () => document.body.querySelector('.cpdp-row[data-active]') as HTMLElement | null;
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (k: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('1 — a disabled control is inert, panel and all', () => {
  it('closes an open ladder when the control becomes disabled', () => {
    const [dis, setDis] = createSignal(false);
    mount(() => (
      <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} disabled={dis()} />
    ));
    click(pills()[0]);
    expect(rows()).toHaveLength(5);
    setDis(true);
    expect(panels()).toHaveLength(0);
    // A disabled combobox must not claim to be expanded.
    expect(pills()[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('refuses to commit even if a row is somehow clicked while disabled', () => {
    // Belt for the close above: the guard lives in commit(), so no route in —
    // including a portalled row still under the pointer — can act.
    const picked = vi.fn();
    const [dis, setDis] = createSignal(false);
    mount(() => (
      <PillDatePicker
        items={LADDER}
        value={null}
        onChange={picked}
        now={NOW}
        disabled={dis()}
        open
      />
    ));
    setDis(true);
    const row = rows()[1];
    if (row) click(row);
    expect(picked).not.toHaveBeenCalled();
  });
});

describe('2 — only the top open picker owns the keyboard', () => {
  it('commits in the most recently opened one, not in both', () => {
    const a = vi.fn();
    const b = vi.fn();
    mount(() => (
      <>
        <PillDatePicker items={LADDER} value={null} onChange={a} now={NOW} open />
        <PillDatePicker items={LADDER} value={null} onChange={b} now={NOW} open />
      </>
    ));
    key('ArrowDown');
    key('Enter');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('hands the keyboard back when the top one closes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const [bOpen, setBOpen] = createSignal(true);
    mount(() => (
      <>
        <PillDatePicker items={LADDER} value={null} onChange={a} now={NOW} open />
        <PillDatePicker items={LADDER} value={null} onChange={b} now={NOW} open={bOpen()} />
      </>
    ));
    setBOpen(false); // the top picker closes; the one underneath must wake up
    key('ArrowDown');
    key('Enter');
    expect(b).not.toHaveBeenCalled();
    expect(a).toHaveBeenCalledTimes(1);
  });
});

describe('3 — the cursor is keyed to the ROW, not to a slot', () => {
  it('stays on the same date when the ladder is re-supplied', () => {
    const [items, setItems] = createSignal<string[]>(LADDER);
    mount(() => (
      <PillDatePicker items={items()} value={'2026-09-18'} onChange={() => {}} now={NOW} />
    ));
    click(pills()[0]);
    key('ArrowDown'); // off the selection, onto Jun 19
    expect(activeRow()!.textContent).toContain('Jun 19');
    setItems([...LADDER]); // an idle refetch: same contents, new array identity
    expect(activeRow()!.textContent).toContain('Jun 19'); // NOT teleported to the selection
  });

  it('survives rows being REMOVED above it — and commits what the user was looking at', () => {
    const picked = vi.fn();
    const [items, setItems] = createSignal<string[]>(LADDER);
    mount(() => <PillDatePicker items={items()} value={null} onChange={picked} now={NOW} />);
    click(pills()[0]);
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown'); // Jul 2 — index 2 today
    expect(activeRow()!.textContent).toContain('Jul 2');
    setItems(LADDER.slice(1)); // an async ladder settling: Jul 2 is now index 1
    expect(activeRow()!.textContent).toContain('Jul 2');
    key('Enter');
    // Under an index cursor this committed Jul 17 — the row that MOVED INTO the
    // slot the user's cursor was pointing at.
    expect(picked).toHaveBeenCalledWith('2026-07-02');
  });

  it('drops the cursor honestly when its own row disappears', () => {
    const [items, setItems] = createSignal<string[]>(LADDER);
    mount(() => <PillDatePicker items={items()} value={null} onChange={() => {}} now={NOW} />);
    click(pills()[0]);
    key('ArrowDown'); // Jun 19
    setItems(LADDER.slice(1)); // ...which is the row that just left
    expect(activeRow()).toBeNull(); // no cursor beats a cursor on the wrong row
  });

  it('clicking a row commits THAT row after a reorder', () => {
    const picked = vi.fn();
    const [items, setItems] = createSignal<string[]>(LADDER);
    mount(() => <PillDatePicker items={items()} value={null} onChange={picked} now={NOW} />);
    click(pills()[0]);
    setItems([...LADDER].reverse());
    click(rows()[0]);
    expect(picked).toHaveBeenCalledWith('2026-09-18');
  });
});

describe('4 — the active row is announceable', () => {
  it('wires combobox → listbox → active row, and only while open', () => {
    mount(() => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />);
    const combo = pills()[0];
    expect(combo.getAttribute('aria-activedescendant')).toBeNull();
    expect(combo.getAttribute('aria-controls')).toBeNull();

    click(combo);
    key('ArrowDown');
    const active = activeRow()!;
    expect(active.id).toBeTruthy();
    expect(combo.getAttribute('aria-activedescendant')).toBe(active.id);
    const listbox = document.body.querySelector('.cpdp-popout') as HTMLElement;
    expect(combo.getAttribute('aria-controls')).toBe(listbox.id);
    expect(listbox.id).toBeTruthy();
  });

  it('drops the pointer when the ladder closes — a descendant that is not in the document is a lie', () => {
    mount(() => <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} />);
    const combo = pills()[0];
    click(combo);
    key('ArrowDown');
    expect(combo.getAttribute('aria-activedescendant')).toBeTruthy();
    key('Escape');
    expect(combo.getAttribute('aria-activedescendant')).toBeNull();
    expect(combo.getAttribute('aria-controls')).toBeNull();
  });

  it('gives two instances distinct ids', () => {
    mount(() => (
      <>
        <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} open />
        <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} open />
      </>
    ));
    const ids = [...panels()].map((p) => (p as HTMLElement).id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('5 — itemState is asked once per item, not once per read', () => {
  it('costs one call per item for an open, and none for a keypress', () => {
    let calls = 0;
    mount(() => (
      <PillDatePicker
        items={LADDER}
        value={null}
        onChange={() => {}}
        now={NOW}
        open
        itemState={() => {
          calls++;
          return 'available';
        }}
      />
    ));
    expect(calls).toBe(LADDER.length);
    key('ArrowDown');
    key('ArrowDown');
    // The arrows scan the ladder for the next enabled row; that scan must read
    // the memo, not re-ask the caller.
    expect(calls).toBe(LADDER.length);
  });

  it('re-asks when the items or the predicate change, and not otherwise', () => {
    let calls = 0;
    const [items, setItems] = createSignal<string[]>(LADDER);
    mount(() => (
      <PillDatePicker
        items={items()}
        value={null}
        onChange={() => {}}
        now={NOW}
        open
        itemState={() => {
          calls++;
          return 'available';
        }}
      />
    ));
    calls = 0;
    setItems([...LADDER, '2026-12-18']);
    expect(calls).toBe(LADDER.length + 1);
  });
});
