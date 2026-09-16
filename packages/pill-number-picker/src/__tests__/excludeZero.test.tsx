/**
 * `excludeZero` — 0 is not legal. Stepping across zero flips sign in one step; a typed 0
 * resolves to the nearest step.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { PillNumberPicker } from '../PillNumberPicker';

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

const root = (c: HTMLElement) =>
  c.querySelector('[role="spinbutton"]') as HTMLElement;
const key = (el: EventTarget, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const wheel = (el: EventTarget, deltaY: number) =>
  el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
/** Default layout is `value-inc-dec`, so: [+, −]. */
const buttons = (c: HTMLElement) => [...c.querySelectorAll('.cpnp-btn')] as HTMLButtonElement[];

function harness(opts: { initial: number; min?: number; max?: number }) {
  const changes: number[] = [];
  const [v, setV] = createSignal(opts.initial);
  const host = mount(() => (
    <PillNumberPicker
      excludeZero
      value={v()}
      onChange={(n) => { changes.push(n); setV(n); }}
      min={opts.min ?? -999}
      max={opts.max ?? 999}
      step={1}
    />
  ));
  return { host, changes, value: v };
}

describe('excludeZero', () => {
  it('ArrowDown from +1 skips zero and lands on −1 in ONE step', () => {
    const { host, changes } = harness({ initial: 1 });
    key(root(host), 'ArrowDown');
    expect(changes).toEqual([-1]);
  });

  it('ArrowUp from −1 skips zero and lands on +1 in ONE step', () => {
    const { host, changes } = harness({ initial: -1 });
    key(root(host), 'ArrowUp');
    expect(changes).toEqual([1]);
  });

  it('wheel across zero flips the sign too', () => {
    const { host, changes } = harness({ initial: 1 });
    wheel(root(host), 100); // scroll down = step down
    expect(changes).toEqual([-1]);
  });

  it('the + BUTTON skips zero too — a click is not a second implementation', () => {
    // The click handlers bypassed the shared resolver: a click emitted 0 while a hold landed on +1.
    const { host, changes } = harness({ initial: -1 });
    click(buttons(host)[0]);
    expect(changes).toEqual([1]);
  });

  it('the − BUTTON skips zero too', () => {
    const { host, changes } = harness({ initial: 1 });
    click(buttons(host)[1]);
    expect(changes).toEqual([-1]);
  });

  it('a button click the bounds turn into a no-op publishes NOTHING', () => {
    // Same state as the ArrowDown case below, which is asserted to publish nothing.
    const { host, changes } = harness({ initial: 1, min: 0 });
    click(buttons(host)[1]);
    expect(changes).toEqual([]);
  });

  it('bounds that force the skip back onto 0 make the move a NO-OP, never a 0', () => {
    // min 0 means the only value below +1 is the excluded 0 — stepping down
    // must do nothing rather than emit it.
    const { host, changes } = harness({ initial: 1, min: 0 });
    key(root(host), 'ArrowDown');
    expect(changes).toEqual([]);
  });

  it('without the prop, zero steps normally (default unchanged)', () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(1);
    const host = mount(() => (
      <PillNumberPicker value={v()} onChange={(n) => { changes.push(n); setV(n); }} min={-9} max={9} step={1} />
    ));
    key(root(host), 'ArrowDown');
    expect(changes).toEqual([0]);
  });
});
