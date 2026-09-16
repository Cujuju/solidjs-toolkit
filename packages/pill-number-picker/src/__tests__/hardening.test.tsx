/**
 * Hardening — paths where ONE publish path disagreed with the others. Rendered with
 * solid-js/web + manual dispose, NOT @solidjs/testing-library (see collapse.test.tsx).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
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
  vi.useRealTimers();
});

const panel = () => document.body.querySelector('.cpnp-popout') as HTMLElement | null;
const buttonsIn = (el: ParentNode | null) =>
  (el ? [...el.querySelectorAll('.cpnp-btn')] : []) as HTMLButtonElement[];
const valueCell = (c: ParentNode) => c.querySelector('[data-pos="value"]') as HTMLElement;
const anchorValue = (c: HTMLElement) =>
  c.querySelector('.cpnp-anchor [data-pos="value"], .cpnp-anchor [data-placeholder="true"]') as HTMLElement;
const inputEl = () => document.body.querySelector('.cpnp-input') as HTMLInputElement | null;

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
/** A pointer-generated click: `detail` is the click count, 0 only for keyboard/programmatic clicks. */
const pointerClick = (el: Element) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
const key = (el: EventTarget, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const pointerDown = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }) as unknown as Event);
const pointerUp = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }) as unknown as Event);
/** Returns false when the picker called preventDefault — i.e. it ate the page scroll. */
const wheel = (el: EventTarget, deltaY: number) =>
  el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));

function plain(opts: {
  initial: number;
  min?: number;
  max?: number;
  step?: number;
  requireFocus?: boolean;
  applyChange?: boolean;
  disabled?: () => boolean;
}) {
  const changes: number[] = [];
  const [v, setV] = createSignal(opts.initial);
  const host = mount(() => (
    <PillNumberPicker
      value={v()}
      onChange={(n) => { changes.push(n); if (opts.applyChange !== false) setV(n); }}
      min={opts.min ?? 1}
      max={opts.max ?? 100}
      step={opts.step}
      requireFocus={opts.requireFocus}
      disabled={opts.disabled?.()}
    />
  ));
  return { host, changes, value: v };
}

describe('wheel — a gesture only counts when it is vertical AND can move the value', () => {
  it('deltaY === 0 (a horizontal swipe / shift+wheel) does NOT step', () => {
    // `deltaY < 0 ? up : down` splits three values with one test, so 0 fell into DOWN:
    // scrolling a container sideways over the pill walked the value to min.
    const { host, changes } = plain({ initial: 5 });
    const notEaten = wheel(valueCell(host), 0);
    expect(changes).toEqual([]);
    expect(notEaten, 'a horizontal gesture was swallowed').toBe(true);
  });

  it('a wheel that cannot move the value publishes nothing and lets the page scroll', () => {
    const { host, changes } = plain({ initial: 100, max: 100 });
    const notEaten = wheel(valueCell(host), -100); // up, already at max
    expect(changes).toEqual([]);
    expect(notEaten, 'a maxed-out picker swallowed the page scroll').toBe(true);
  });

  it('step={0} cannot turn every tick into a no-op publish', () => {
    const { host, changes } = plain({ initial: 5, step: 0 });
    wheel(valueCell(host), 100);
    wheel(valueCell(host), 100);
    expect(changes).toEqual([]);
  });

  it('a wheel that DOES move still steps and still claims the gesture', () => {
    const { host, changes } = plain({ initial: 5 });
    const notEaten = wheel(valueCell(host), 100);
    expect(changes).toEqual([4]);
    expect(notEaten).toBe(false);
  });
});

describe('auto-repeat', () => {
  it('releasing a hold does NOT add one extra step on top of it', () => {
    // `click` is dispatched after `pointerup`, so a held press produced N repeat steps
    // plus one more — overshooting the value the user was watching when they released.
    vi.useFakeTimers();
    const { host, changes } = plain({ initial: 5 });
    const inc = buttonsIn(host)[0];
    pointerDown(inc);
    vi.advanceTimersByTime(400 + 60 * 2); // delay + two intervals => 3 ticks
    pointerUp(inc);
    pointerClick(inc);
    expect(changes).toEqual([6, 7, 8]);
  });

  it('a quick tap still steps exactly once — the click is the only step', () => {
    vi.useFakeTimers();
    const { host, changes } = plain({ initial: 5 });
    const inc = buttonsIn(host)[0];
    pointerDown(inc);
    vi.advanceTimersByTime(50); // released well before the repeat threshold
    pointerUp(inc);
    pointerClick(inc);
    expect(changes).toEqual([6]);
  });

  it('going DISABLED mid-hold stops the repeat', () => {
    // Consumer disables without advancing the value; a disabled <button> gets no pointerup to stop the hold.
    vi.useFakeTimers();
    const changes: number[] = [];
    const [disabled, setDisabled] = createSignal(false);
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        disabled={disabled()}
        onChange={(n) => { changes.push(n); setDisabled(true); }}
        min={1}
        max={100}
      />
    ));
    pointerDown(buttonsIn(host)[0]);
    vi.advanceTimersByTime(400); // first tick: publishes 6, consumer disables
    expect(changes).toEqual([6]);
    vi.advanceTimersByTime(5000); // no pointerup will ever arrive
    expect(changes, 'the repeat outlived the enabled state').toEqual([6]);
  });
});

describe('requireFocus', () => {
  it('survives an inline edit — focus that left the widget no longer counts', () => {
    // An edit once ended without clearing a stored focus flag, leaving requireFocus dead.
    const { host, changes } = plain({ initial: 5, requireFocus: true });
    const span = valueCell(host);
    click(span); // enter edit mode
    const input = host.querySelector('.cpnp-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.dispatchEvent(new FocusEvent('blur')); // clicked away — nothing is focused now
    const notEaten = wheel(valueCell(host), 100);
    expect(changes, 'the wheel stepped a picker that has no focus').toEqual([]);
    expect(notEaten, 'the wheel was swallowed by an unfocused picker').toBe(true);
  });
});

describe('two open pop-outs', () => {
  it('only the most recently opened one answers Escape', () => {
    // Both bind Escape to the DOCUMENT, and stopPropagation cannot suppress a sibling
    // listener on the same node — so one Escape discarded BOTH edits.
    const a = vi.fn();
    const b = vi.fn();
    mount(() => (
      <>
        <PillNumberPicker collapsible open value={5} onChange={() => {}} onCancel={a} min={1} max={100} />
        <PillNumberPicker collapsible open value={5} onChange={() => {}} onCancel={b} min={1} max={100} />
      </>
    ));
    key(document, 'Escape');
    expect(b).toHaveBeenCalledTimes(1);
    expect(a, 'the picker underneath cancelled too').not.toHaveBeenCalled();
  });
});

describe('closing the pop-out returns the keyboard somewhere', () => {
  it('Enter-to-confirm restores focus to the collapsed value cell', () => {
    // Escape already did this deliberately; Enter — the PRIMARY confirmation — left
    // activeElement on <body>, so the next Tab restarted at the top of the document.
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker collapsible value={v()} onChange={setV} min={1} max={100} />
    ));
    click(anchorValue(host));
    key(inputEl()!, 'Enter');
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(anchorValue(host));
  });
});

describe("finish-mode display — every read goes through current()", () => {
  it('the range text tracks the draft, not the stale prop', () => {
    const host = mount(() => (
      <PillNumberPicker collapsible commit="finish" showRange value={5} onChange={() => {}} min={1} max={100} />
    ));
    click(anchorValue(host));
    click(buttonsIn(panel())[0]);
    click(buttonsIn(panel())[0]); // draft 7
    expect((host.querySelector('.cpnp-range') as HTMLElement).textContent).toBe('7 / 100');
  });

  it('the suffix appears once the draft leaves the zeroLabel value', () => {
    const host = mount(() => (
      <PillNumberPicker
        collapsible
        commit="finish"
        value={0}
        zeroLabel="Off"
        suffix="kg"
        onChange={() => {}}
        min={0}
        max={100}
      />
    ));
    expect(host.querySelector('.cpnp-suffix')).toBeNull(); // 'Off', no unit
    click(anchorValue(host));
    click(buttonsIn(panel())[0]); // draft 1 — no longer 'Off'
    expect((host.querySelector('.cpnp-suffix') as HTMLElement | null)?.textContent).toBe('kg');
  });
});

// ── Round 2 — defects found in the round-1 fixes ────────────────────────────

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const pointerLeave = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerleave', { bubbles: false }) as unknown as Event);
const pointerCancel = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }) as unknown as Event);

describe('auto-repeat — an abandoned hold leaves no latch behind', () => {
  // Dragging off the button (or a cancelled pointer) produces NO click, so the "swallow the
  // release click" flag must not survive into the next activation — a keyboard Enter/Space.
  for (const [name, abandon] of [['pointerleave', pointerLeave], ['pointercancel', pointerCancel]] as const) {
    it(`a hold ended by ${name} does not swallow the next keyboard click`, () => {
      vi.useFakeTimers();
      const { host, changes } = plain({ initial: 5 });
      const inc = buttonsIn(host)[0];
      pointerDown(inc);
      vi.advanceTimersByTime(400); // one repeat tick => 6
      abandon(inc);
      click(inc); // keyboard activation: a click with no pointerdown before it
      expect(changes).toEqual([6, 7]);
    });
  }
});

describe('requireFocus — focus anywhere inside the widget counts', () => {
  it('moving from the inline editor to this picker’s own + keeps the wheel live', () => {
    const { host, changes } = plain({ initial: 5, requireFocus: true });
    click(valueCell(host));
    (host.querySelector('.cpnp-input') as HTMLInputElement).focus();
    buttonsIn(host)[1].focus();
    wheel(valueCell(host), 100);
    expect(changes, 'focus never left the widget, yet the wheel was blocked').toEqual([4]);
  });

  it('focus leaving a stepper button for outside the widget gates the wheel again', () => {
    const { host, changes } = plain({ initial: 5, requireFocus: true });
    click(valueCell(host));
    (host.querySelector('.cpnp-input') as HTMLInputElement).focus();
    const inc = buttonsIn(host)[0];
    inc.focus();
    wheel(valueCell(host), 100);
    expect(changes).toEqual([4]);
    inc.blur();
    wheel(valueCell(host), 100);
    expect(changes, 'focus left the widget, yet the wheel still stepped').toEqual([4]);
  });
});

describe('closing the pop-out — focus is returned only when the picker closed itself', () => {
  it('an outside press does NOT pull focus back onto the pill', () => {
    // At `pointerdown` the browser has not moved focus yet, so sniffing activeElement cannot
    // tell "ours" from "about to be the pressed control's".
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker collapsible value={v()} onChange={setV} min={1} max={100} />
    ));
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    click(anchorValue(host));
    expect(document.activeElement).toBe(inputEl());
    pointerDown(outside);
    expect(panel()).toBeNull();
    expect(document.activeElement, 'the outside press was fought for focus').not.toBe(anchorValue(host));
  });

  function asyncControlled() {
    const [v, setV] = createSignal(5);
    const [open, setOpen] = createSignal(false);
    const host = mount(() => (
      <PillNumberPicker
        collapsible
        open={open()}
        onOpenChange={(o) => queueMicrotask(() => setOpen(o))}
        value={v()}
        onChange={setV}
        min={1}
        max={100}
      />
    ));
    return { host };
  }

  it('Enter restores focus even when the consumer lowers `open` asynchronously', async () => {
    const { host } = asyncControlled();
    click(anchorValue(host));
    await flush();
    expect(document.activeElement).toBe(inputEl());
    key(inputEl()!, 'Enter');
    await flush();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(anchorValue(host));
  });

  it('Escape restores focus even when the consumer lowers `open` asynchronously', async () => {
    const { host } = asyncControlled();
    click(anchorValue(host));
    await flush();
    key(document, 'Escape');
    await flush();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(anchorValue(host));
  });

  it('an async close does not steal focus the user moved away during the delay', async () => {
    const { host } = asyncControlled();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    click(anchorValue(host));
    await flush();
    key(inputEl()!, 'Enter');
    outside.focus(); // before the consumer's microtask lowers `open`
    await flush();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('a consumer that closes much later does not steal focus the user moved away', () => {
    const [open, setOpen] = createSignal(false);
    mount(() => (
      <PillNumberPicker collapsible open={open()} onOpenChange={() => {}} value={5} onChange={() => {}} min={1} max={100} />
    ));
    setOpen(true);
    key(inputEl()!, 'Enter'); // the consumer ignores onOpenChange(false)
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    setOpen(false);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('focus that left for outside, then dropped to <body>, is not pulled back on an async close', async () => {
    const { host } = asyncControlled();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    click(anchorValue(host));
    await flush();
    buttonsIn(panel())[0].focus();
    key(document, 'Escape'); // the panel stays up until the consumer's microtask
    outside.focus();
    outside.blur(); // e.g. a click on non-focusable page area
    await flush();
    expect(panel()).toBeNull();
    expect(document.activeElement, 'focus was pulled back onto the pill').not.toBe(anchorValue(host));
  });

  it('a close the CONSUMER initiates does not pull focus onto the pill', () => {
    // editable={false}: nothing in the pop-out ever holds focus, so activeElement is <body>
    // for the whole session — which is not evidence the user was on this pill.
    const [open, setOpen] = createSignal(false);
    const host = mount(() => (
      <PillNumberPicker collapsible editable={false} open={open()} value={5} onChange={() => {}} min={1} max={100} />
    ));
    setOpen(true);
    setOpen(false);
    expect(panel()).toBeNull();
    expect(document.activeElement, 'a route-driven close stole focus').not.toBe(anchorValue(host));
  });
});

describe('movement — every stepping input goes through one path', () => {
  // Pins the stepBy contract: keys, page keys, wheel and buttons resolve excludeZero and the
  // bounds identically. Round 2 routed the keys and the wheel through it.
  it('arrows, page keys, wheel and buttons all skip zero and stop at the bound', () => {
    const run = (drive: (host: HTMLElement) => void) => {
      const changes: number[] = [];
      const [v, setV] = createSignal(2);
      const host = mount(() => (
        <PillNumberPicker excludeZero value={v()} onChange={(n) => { changes.push(n); setV(n); }} min={-2} max={2} />
      ));
      for (let i = 0; i < 5; i++) drive(host);
      dispose?.();
      dispose = null;
      document.body.innerHTML = '';
      return changes;
    };
    const expected = [1, -1, -2];
    expect(run((h) => key(valueCell(h), 'ArrowDown'))).toEqual(expected);
    expect(run((h) => wheel(valueCell(h), 100))).toEqual(expected);
    expect(run((h) => click(buttonsIn(h)[1]))).toEqual(expected);
    expect(run((h) => key(valueCell(h), 'PageDown'))).toEqual([-2]);
  });
});

// ── Round 3 ────────────────────────────────────────────────────────────────

describe('auto-repeat — the release click is recognised at the click', () => {
  it('touch order (pointerup → pointerleave → click) still swallows the release click', () => {
    vi.useFakeTimers();
    const { host, changes } = plain({ initial: 5 });
    const inc = buttonsIn(host)[0];
    pointerDown(inc);
    vi.advanceTimersByTime(400); // one repeat tick => 6
    pointerUp(inc);
    pointerLeave(inc);
    pointerClick(inc);
    expect(changes).toEqual([6]);
  });

  it('a hold stopped by going disabled does not swallow a keyboard click after re-enable', () => {
    vi.useFakeTimers();
    const changes: number[] = [];
    const [disabled, setDisabled] = createSignal(false);
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        disabled={disabled()}
        onChange={(n) => { changes.push(n); setDisabled(true); }}
        min={1}
        max={100}
      />
    ));
    const inc = buttonsIn(host)[0];
    pointerDown(inc);
    vi.advanceTimersByTime(400); // publishes 6, consumer disables; no click will follow
    setDisabled(false);
    click(inc); // keyboard activation
    expect(changes).toEqual([6, 6]);
  });
});

describe('requireFocus — read from the DOM at wheel time', () => {
  it('a panel unmounted with focus inside it leaves no focus state behind', () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker collapsible requireFocus value={v()} onChange={(n) => { changes.push(n); setV(n); }} min={1} max={100} />
    ));
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    click(anchorValue(host));
    buttonsIn(panel())[0].focus();
    pointerDown(outside); // unmounts the panel; no focusout reaches a listener
    expect(panel()).toBeNull();
    wheel(anchorValue(host), 100);
    expect(changes, 'the wheel stepped a pill that has no focus').toEqual([]);
  });
});

describe('closing while the editor holds typed text', () => {
  /** Emulates Chromium's removal blur (blur + focusout, focus already on <body>). Hooks ONLY
   *  removeChild, replaceChild and Element.remove; other removal APIs are not emulated. */
  function blurOnRemoval(): () => void {
    const { removeChild, replaceChild } = Node.prototype;
    const { remove } = Element.prototype;
    const blurIfInside = (node: Node): void => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && node.contains(active)) active.blur();
    };
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      blurIfInside(child);
      return removeChild.call(this, child) as T;
    };
    Node.prototype.replaceChild = function <T extends Node>(this: Node, node: Node, child: T): T {
      blurIfInside(child);
      return replaceChild.call(this, node, child) as T;
    };
    Element.prototype.remove = function (this: Element): void {
      blurIfInside(this);
      remove.call(this);
    };
    return () => {
      Node.prototype.removeChild = removeChild;
      Node.prototype.replaceChild = replaceChild;
      Element.prototype.remove = remove;
    };
  }

  it('the emulation fires blur then focusout, with focus already on <body>', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const seen: string[] = [];
    for (const type of ['blur', 'focusout']) {
      input.addEventListener(type, () => seen.push(`${type}:${document.activeElement === document.body}`));
    }
    const restore = blurOnRemoval();
    try {
      input.remove();
    } finally {
      restore();
    }
    expect(seen).toEqual(['blur:true', 'focusout:true']);
  });

  async function typeThenClose(
    close: (setOpen: (o: boolean) => void) => void,
    consumer: 'sync' | 'async' = 'sync',
  ): Promise<number[]> {
    const changes: number[] = [];
    const [v, setV] = createSignal(5);
    const [open, setOpen] = createSignal(false);
    mount(() => (
      <PillNumberPicker
        collapsible
        open={open()}
        onOpenChange={consumer === 'sync' ? setOpen : (o) => queueMicrotask(() => setOpen(o))}
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        min={1}
        max={100}
      />
    ));
    setOpen(true);
    const input = inputEl()!;
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const restore = blurOnRemoval();
    try {
      close(setOpen);
      await flush();
    } finally {
      restore();
    }
    expect(panel()).toBeNull();
    return changes;
  }

  it('Escape does not publish the half-typed text on the removal blur', async () => {
    expect(await typeThenClose(() => key(document, 'Escape'))).toEqual([]);
  });

  it('a consumer close does not publish the half-typed text on the removal blur', async () => {
    expect(await typeThenClose((setOpen) => setOpen(false))).toEqual([]);
  });

  it('Escape with an ASYNC consumer does not publish the half-typed text', async () => {
    expect(await typeThenClose(() => key(document, 'Escape'), 'async')).toEqual([]);
  });

  it('an outside press with an ASYNC consumer does not publish the half-typed text', async () => {
    expect(await typeThenClose(() => pointerDown(document.body), 'async')).toEqual([]);
  });

  // The mirror image: a consumer that never lowers `open` keeps the panel alive after a
  // commit, so the editor can be re-opened. That later blur is NOT a close — it publishes.
  it('a consumer that ignores onOpenChange still publishes text typed after a commit', () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(5);
    mount(() => (
      <PillNumberPicker
        collapsible
        open={true}
        onOpenChange={() => {}}
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        min={1}
        max={100}
      />
    ));
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const type = (text: string): HTMLInputElement => {
      const input = inputEl()!;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input;
    };
    key(type('42'), 'Enter');
    expect(changes).toEqual([42]);
    expect(panel(), 'the consumer kept `open` true, so the pop-out survives').not.toBeNull();
    click(valueCell(panel()!)); // back into the editor
    const input = type('77');
    outside.focus();
    input.dispatchEvent(new FocusEvent('blur', { relatedTarget: outside, bubbles: false }));
    expect(changes).toEqual([42, 77]);
  });
});

describe('page keys — the multi-step path skips zero too', () => {
  it('PageDown landing exactly on 0 resolves to -1', () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(10);
    const host = mount(() => (
      <PillNumberPicker excludeZero value={v()} onChange={(n) => { changes.push(n); setV(n); }} min={-20} max={20} />
    ));
    key(valueCell(host), 'PageDown');
    expect(changes).toEqual([-1]);
  });
});
