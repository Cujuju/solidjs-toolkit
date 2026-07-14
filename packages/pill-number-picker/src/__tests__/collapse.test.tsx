/**
 * Collapse + pop-out — the BEHAVIOUR, not the geometry.
 *
 * `popout.test.ts` proves the placement math. It cannot prove the things that actually
 * break: that a collapsed picker hides its buttons, that expanding escapes a clipping
 * ancestor, that the resting state still steps, that the thing can be dismissed.
 *
 * Rendered with `render` from `solid-js/web` and disposed by hand — the toolkit's own
 * pattern (see ContextMenu.test.tsx, AnchoredPopover.test.tsx). NOT
 * `@solidjs/testing-library`: it resolves its own copy of Solid, and two Solid instances
 * means two ownership graphs — its `cleanup()` disposes the root IT created while the
 * component's <Portal> belongs to the other one, so pop-outs survive teardown and the
 * next test silently queries a stale panel. (Diagnosed the hard way: an assertion that
 * looked like a component leak was the harness all along.)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { PillNumberPicker } from '../PillNumberPicker';

let dispose: (() => void) | null = null;
let host: HTMLDivElement;

function mount(ui: () => any): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
  return host;
}

afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

/** The picker's DOM vocabulary — assert the contract, not the markup. */
const rootOf = (c: HTMLElement) => c.querySelector('.cpnp-root') as HTMLElement;
const anchorOf = (c: HTMLElement) => c.querySelector('.cpnp-anchor') as HTMLElement;
/** The pop-out is PORTALLED, so it is NOT under the host — look at the document. */
const panel = () => document.body.querySelector('.cpnp-popout') as HTMLElement | null;
const panels = () => document.body.querySelectorAll('.cpnp-popout');
const buttonsIn = (el: ParentNode | null) => (el ? [...el.querySelectorAll('.cpnp-btn')] : []) as HTMLButtonElement[];
const spinbuttons = (el: ParentNode) => [...el.querySelectorAll('[role="spinbutton"]')] as HTMLElement[];
const placeholderIn = (c: HTMLElement) =>
  anchorOf(c).querySelector('[data-placeholder="true"]') as HTMLElement;

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (el: EventTarget, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const pointerDown = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }) as unknown as Event);

function Harness(props: { collapsible?: boolean; initial?: number }) {
  const [v, setV] = createSignal(props.initial ?? 1);
  return (
    <PillNumberPicker
      collapsible={props.collapsible}
      value={v()}
      onChange={setV}
      min={1}
      max={100}
      ariaLabel="Quantity"
    />
  );
}

describe('collapsible', () => {
  it('is OFF by default — an existing call site renders the full picker, unchanged', () => {
    const c = mount(() => <Harness />);
    expect(buttonsIn(c).length).toBe(2); // + and −
    expect(panel()).toBeNull();
    expect(rootOf(c).dataset.collapsible).toBeUndefined();
  });

  it('collapsed: renders the value and NO buttons', () => {
    const c = mount(() => <Harness collapsible initial={7} />);
    expect(spinbuttons(c)[0].textContent).toBe('7');
    expect(buttonsIn(c).length).toBe(0);
    expect(panel()).toBeNull();
  });

  it('collapsed: the value still STEPS via the keyboard, without ever expanding', () => {
    // This is what makes the collapse cheap: the common case (nudge a qty) never needs
    // the pop-out at all. If expanding were mandatory, the feature would be a tax.
    const c = mount(() => <Harness collapsible initial={5} />);
    const value = spinbuttons(c)[0];
    key(value, 'ArrowUp');
    expect(value.textContent).toBe('6');
    key(value, 'ArrowDown');
    key(value, 'ArrowDown');
    expect(value.textContent).toBe('4');
    expect(panel()).toBeNull(); // never opened
  });

  it('collapsed: clicking the value opens the EDITOR — pop-out + a live text field', () => {
    // Click-to-open means the editor is ready to type into immediately. Anything less and
    // the user pays a second click to reach the keyboard, which is the tax this removes.
    const c = mount(() => <Harness collapsible />);
    click(spinbuttons(c)[0]);
    expect(panel()).not.toBeNull();
    expect(buttonsIn(panel()).length).toBe(2);
    const input = document.body.querySelector('.cpnp-input') as HTMLInputElement | null;
    expect(input, 'the pop-out has no text field').not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('expands from the KEYBOARD (Enter and Space), or the buttons are mouse-only', () => {
    for (const k of ['Enter', ' ']) {
      const c = mount(() => <Harness collapsible />);
      key(spinbuttons(c)[0], k);
      expect(panel(), `"${k}" did not expand the picker`).not.toBeNull();
      dispose?.();
      dispose = null;
      document.body.innerHTML = '';
    }
  });

  it('the +/- inside the pop-out actually change the value', () => {
    // Opening puts the value cell into edit mode, so the live value is the INPUT's value,
    // not a span's text. The anchor mirrors it — a stale number under an open panel would
    // be a lie about what pressing Enter is about to commit.
    const c = mount(() => <Harness collapsible initial={3} />);
    click(spinbuttons(c)[0]);
    const [inc, dec] = buttonsIn(panel());
    const liveValue = () => (document.body.querySelector('.cpnp-input') as HTMLInputElement).value;

    click(inc);
    expect(liveValue()).toBe('4');
    expect(placeholderIn(c).textContent).toBe('4');

    click(dec);
    click(dec);
    expect(liveValue()).toBe('2');
    expect(placeholderIn(c).textContent).toBe('2');
  });

  it('PORTALS the pop-out out of the root — the reason the feature works at all', () => {
    // An in-flow expansion is clipped dead by any overflow:hidden / overflow-y:auto
    // ancestor, which is exactly the dense layout this exists for. The panel must not be
    // a descendant of the picker's root.
    const c = mount(() => (
      <div style={{ overflow: 'hidden', width: '40px' }}>
        <Harness collapsible />
      </div>
    ));
    click(spinbuttons(c)[0]);
    const p = panel();
    expect(p).not.toBeNull();
    expect(rootOf(c).contains(p)).toBe(false);
    expect(c.contains(p)).toBe(false);
  });

  it('DISPOSES the pop-out when the picker unmounts — no orphan panel left in <body>', () => {
    // A consumer that unmounts a row while its picker is open (a keyed <For> rebuilding
    // its list, say) must not leak a floating panel into the document forever.
    const c = mount(() => <Harness collapsible />);
    click(spinbuttons(c)[0]);
    expect(panels().length).toBe(1);
    dispose?.();
    dispose = null;
    expect(panels().length).toBe(0);
  });

  it('keeps the anchor in flow while open, so the host row never reflows', () => {
    const c = mount(() => <Harness collapsible initial={9} />);
    click(spinbuttons(c)[0]);
    const ph = placeholderIn(c);
    expect(ph.textContent).toBe('9');
    // aria-hidden so a screen reader is not offered the same spinbutton twice.
    expect(ph.getAttribute('aria-hidden')).toBe('true');
    expect(spinbuttons(anchorOf(c)).length).toBe(0);
  });

  it('dismisses on an outside pointerdown', () => {
    const c = mount(() => <Harness collapsible />);
    click(spinbuttons(c)[0]);
    expect(panel()).not.toBeNull();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    pointerDown(outside);
    expect(panel()).toBeNull();
  });

  it('does NOT dismiss on a pointerdown INSIDE the pop-out', () => {
    // Otherwise the panel would close the instant you reached for the + button.
    const c = mount(() => <Harness collapsible />);
    click(spinbuttons(c)[0]);
    pointerDown(buttonsIn(panel())[0]);
    expect(panel()).not.toBeNull();
  });

  it('dismisses on Escape', () => {
    const c = mount(() => <Harness collapsible />);
    click(spinbuttons(c)[0]);
    key(document, 'Escape');
    expect(panel()).toBeNull();
  });

  it('honours a CONTROLLED open state', () => {
    const [open, setOpen] = createSignal(false);
    mount(() => (
      <PillNumberPicker
        collapsible
        open={open()}
        onOpenChange={setOpen}
        value={2}
        onChange={() => {}}
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
      <PillNumberPicker
        collapsible
        onOpenChange={(o) => seen.push(o)}
        value={1}
        onChange={() => {}}
      />
    ));
    click(spinbuttons(c)[0]);
    key(document, 'Escape');
    expect(seen).toEqual([true, false]);
  });

  it('never truncates the number — the collapsed cell hugs its digits', () => {
    // The reserved width is a FLOOR, not a fixed width. A value that outgrows it must
    // widen the pill, never be clipped by it.
    const c = mount(() => <Harness collapsible initial={100} />);
    const value = spinbuttons(c)[0];
    expect(value.textContent).toBe('100');
    expect(value.style.width).toBe('max-content');
    expect(value.style.minWidth).not.toBe('');
  });
});
