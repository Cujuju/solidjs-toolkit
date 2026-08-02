/**
 * `excludeZero` — 0 is not a legal value; the picker never emits it.
 *
 * The consumer that motivated it (a SIGNED order-quantity field, +N long /
 * −N short) treats the sign as a semantic axis and zero as a non-entity:
 * stepping across zero must FLIP to the other sign in one step, and a typed
 * 0 must resolve to the smallest step on the current side.
 *
 * Rendered with solid-js/web + manual dispose — see collapse.test.tsx's note.
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
