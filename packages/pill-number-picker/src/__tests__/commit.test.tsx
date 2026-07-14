/**
 * The editing SESSION — commit / cancel, and the two commit modes.
 *
 * A session begins when the collapsed pill is clicked (the editor opens) and ends on a
 * COMMIT (Enter, or clicking the pill again) or a CANCEL (Escape, or an outside press).
 *
 * `commit: 'change'` publishes every step as it happens (the historical behaviour).
 * `commit: 'finish'` steps a local draft and publishes ONLY on commit — for a consumer
 * where every intermediate value costs something real (a request, a reprice), being told
 * about values the user never settled on is not noise, it is wrong.
 *
 * Rendered with solid-js/web + manual dispose — NOT @solidjs/testing-library. See the
 * note at the top of collapse.test.tsx: it resolves a second Solid instance and the
 * component's <Portal> then outlives the harness's teardown.
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

const panel = () => document.body.querySelector('.cpnp-popout') as HTMLElement | null;
const buttonsIn = (el: ParentNode | null) =>
  (el ? [...el.querySelectorAll('.cpnp-btn')] : []) as HTMLButtonElement[];
const anchorValue = (c: HTMLElement) =>
  c.querySelector('.cpnp-anchor [data-pos="value"], .cpnp-anchor [data-placeholder="true"]') as HTMLElement;
const inputEl = () => document.body.querySelector('.cpnp-input') as HTMLInputElement | null;

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (el: EventTarget, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const pointerDown = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }) as unknown as Event);
const typeInto = (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

/** Records everything the component published, so a test can assert on the WHOLE stream —
 *  "did it stay silent" is the entire point of 'finish' mode and a final-value check
 *  cannot see it. */
interface Log {
  changes: number[];
  commits: number[];
  cancels: number[];
}

function harness(opts: {
  commit?: 'change' | 'finish';
  initial?: number;
  revertOnCancel?: boolean;
}): { host: HTMLDivElement; log: Log; value: () => number } {
  const log: Log = { changes: [], commits: [], cancels: [] };
  const [v, setV] = createSignal(opts.initial ?? 5);
  const host = mount(() => (
    <PillNumberPicker
      collapsible
      commit={opts.commit}
      revertOnCancel={opts.revertOnCancel}
      value={v()}
      onChange={(n) => { log.changes.push(n); setV(n); }}
      onCommit={(n) => log.commits.push(n)}
      onCancel={(n) => log.cancels.push(n)}
      min={1}
      max={100}
      ariaLabel="Quantity"
    />
  ));
  return { host, log, value: v };
}

describe('editing session — opening', () => {
  it('clicking the collapsed pill opens the EDITOR, focused and selected', () => {
    // "Click to open the editor" — the text field must be live immediately, or the user
    // has to click a second time to type, which is the tax this design exists to remove.
    const { host } = harness({});
    click(anchorValue(host));
    expect(panel()).not.toBeNull();
    const input = inputEl();
    expect(input, 'no text input in the pop-out').not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('a non-collapsible picker is unaffected — no session, no editor on open', () => {
    const log: Log = { changes: [], commits: [], cancels: [] };
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        onChange={(n) => log.changes.push(n)}
        onCommit={(n) => log.commits.push(n)}
        min={1}
        max={100}
      />
    ));
    click(buttonsIn(host)[0]); // +
    expect(log.changes).toEqual([6]);
    expect(log.commits).toEqual([]); // no session => no confirmation event
  });

  it('REGRESSION: typing a value and pressing Enter publishes it (plain, non-collapsible)', () => {
    // This was BROKEN in the shipped 0.1.0 and nothing caught it, because the package had
    // no DOM tests at all. `commitDraft` called setEditing(false) BEFORE reading the
    // draft, which re-armed the "not editing → resync the draft from the value" effect and
    // overwrote the typed text with the old value before it could be parsed. Typing 42 and
    // pressing Enter silently left you on 5.
    const log: Log = { changes: [], commits: [], cancels: [] };
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker
        value={v()}
        onChange={(n) => { log.changes.push(n); setV(n); }}
        min={1}
        max={100}
      />
    ));
    click(host.querySelector('[data-pos="value"]')!); // enter edit mode
    const input = host.querySelector('.cpnp-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    typeInto(input, '42');
    key(input, 'Enter');
    expect(log.changes).toEqual([42]);
    expect(v()).toBe(42);
  });
});

describe("commit: 'change' (default) — publish as you go", () => {
  it('publishes every step immediately', () => {
    const { host, log } = harness({ commit: 'change', initial: 5 });
    click(anchorValue(host));
    const [inc] = buttonsIn(panel());
    click(inc);
    click(inc);
    expect(log.changes).toEqual([6, 7]);
  });

  it('still fires onCommit when the session ends — settled is not the same as changed', () => {
    const { host, log } = harness({ commit: 'change', initial: 5 });
    click(anchorValue(host));
    click(buttonsIn(panel())[0]); // 6
    key(inputEl()!, 'Enter');
    expect(log.commits).toEqual([6]);
    expect(panel()).toBeNull();
  });

  it('cancel REVERTS the published value — cancel means the same thing in both modes', () => {
    const { host, log, value } = harness({ commit: 'change', initial: 5 });
    click(anchorValue(host));
    click(buttonsIn(panel())[0]); // 6, already published
    key(document, 'Escape');
    // The consumer saw 6, so the revert has to be published too, or it is stranded there.
    expect(log.changes).toEqual([6, 5]);
    expect(value()).toBe(5);
    expect(log.cancels).toEqual([5]);
  });

  it('revertOnCancel={false} keeps the scrubbed value', () => {
    const { host, log, value } = harness({ commit: 'change', initial: 5, revertOnCancel: false });
    click(anchorValue(host));
    click(buttonsIn(panel())[0]); // 6
    key(document, 'Escape');
    expect(log.changes).toEqual([6]);
    expect(value()).toBe(6);
    expect(log.cancels).toEqual([6]);
  });

  it('a cancel that changed nothing publishes nothing — no no-op churn', () => {
    const { host, log } = harness({ commit: 'change', initial: 5 });
    click(anchorValue(host));
    key(document, 'Escape');
    expect(log.changes).toEqual([]);
    expect(log.cancels).toEqual([5]);
  });
});

describe("commit: 'finish' — publish only on confirmation", () => {
  it('stays SILENT while stepping, then publishes once on Enter', () => {
    const { host, log } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    const [inc] = buttonsIn(panel());
    click(inc);
    click(inc);
    click(inc);
    // The whole point: three steps, zero publishes.
    expect(log.changes).toEqual([]);
    key(inputEl()!, 'Enter');
    expect(log.changes).toEqual([8]);
    expect(log.commits).toEqual([8]);
  });

  it('the DISPLAY still tracks the draft while onChange stays silent', () => {
    // Silent must not mean frozen — the user has to see what they are choosing.
    const { host, log } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    click(buttonsIn(panel())[0]); // draft 6
    expect(inputEl()!.value).toBe('6');
    expect(anchorValue(host).textContent).toBe('6');
    expect(log.changes).toEqual([]);
  });

  it('clicking the pill again closes AND confirms', () => {
    const { host, log } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    click(buttonsIn(panel())[0]); // draft 6
    click(anchorValue(host));     // the close gesture
    expect(panel()).toBeNull();
    expect(log.changes).toEqual([6]);
    expect(log.commits).toEqual([6]);
  });

  it('Escape DISCARDS the draft — nothing was ever published, so nothing is undone', () => {
    const { host, log, value } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    click(buttonsIn(panel())[0]);
    click(buttonsIn(panel())[0]); // draft 7
    key(document, 'Escape');
    expect(log.changes).toEqual([]); // never spoke — not even to revert
    expect(value()).toBe(5);
    expect(log.cancels).toEqual([5]);
    expect(anchorValue(host).textContent).toBe('5');
  });

  it('an outside press is a CANCEL, not a silent acceptance', () => {
    const { host, log, value } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    click(buttonsIn(panel())[0]); // draft 6
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    pointerDown(outside);
    expect(panel()).toBeNull();
    expect(log.changes).toEqual([]);
    expect(value()).toBe(5);
    expect(log.cancels).toEqual([5]);
  });

  it('TYPED text is published on Enter, once', () => {
    const { host, log } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    typeInto(inputEl()!, '42');
    expect(log.changes).toEqual([]);
    key(inputEl()!, 'Enter');
    expect(log.changes).toEqual([42]);
    expect(log.commits).toEqual([42]);
  });

  it('typed text is CLAMPED before it is published', () => {
    const { host, log } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    typeInto(inputEl()!, '9999'); // max is 100
    key(inputEl()!, 'Enter');
    expect(log.changes).toEqual([100]);
  });

  it('typed text survives reaching for the + button — blur inside the panel is not the end of the edit', () => {
    // Clicking + while the input has focus blurs it. If that closed the editor, the
    // buttons and the keyboard could not be used in the same session.
    const { host, log } = harness({ commit: 'finish', initial: 5 });
    click(anchorValue(host));
    const input = inputEl()!;
    typeInto(input, '20');
    const inc = buttonsIn(panel())[0];
    input.dispatchEvent(new FocusEvent('blur', { relatedTarget: inc, bubbles: false }));
    expect(panel(), 'the editor closed when focus moved to a button').not.toBeNull();
    click(inc);
    key(inputEl()!, 'Enter');
    expect(log.changes).toEqual([21]); // 20 typed, then +1
  });

  it('wheel / arrow steps on the COLLAPSED pill publish immediately — no session to confirm', () => {
    // A scroll gesture is not an editing session. Requiring a confirmation for it would be
    // a tax on the fastest path the control has.
    const { host, log } = harness({ commit: 'finish', initial: 5 });
    key(anchorValue(host), 'ArrowUp');
    expect(panel()).toBeNull();
    expect(log.changes).toEqual([6]);
    expect(log.commits).toEqual([]);
  });
});
