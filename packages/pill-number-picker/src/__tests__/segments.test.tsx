/**
 * CUSTOM SEGMENTS (`segments`) — and the built-in reset (`resetTo`) that is
 * sugar over the same contract.
 *
 * The contract under test:
 *  - descriptors render as `.cpnp-btn` row members, `data-pos="seg-<key>"`,
 *    in [start…][layout parts][end…][reset] order;
 *  - `onSelect` receives a session-aware api: `setValue` publishes through the
 *    picker's own channel (clamped, excludeZero-resolved, silent inside a
 *    'finish' session), `commit`/`cancel` end an open session;
 *  - the `disabled` predicate tracks the current value reactively;
 *  - `resetTo` renders through the SAME path (key 'reset', outermost-last,
 *    disabled at target) — it had no coverage of its own before this file.
 *
 * Rendered with solid-js/web + manual dispose — NOT @solidjs/testing-library.
 * See the note at the top of collapse.test.tsx: it resolves a second Solid
 * instance and the component's <Portal> then outlives the harness's teardown.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { PillNumberPicker, type PnpSegment, type PnpSegmentApi } from '../PillNumberPicker';

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
const anchorValue = (c: HTMLElement) =>
  c.querySelector('.cpnp-anchor [data-pos="value"], .cpnp-anchor [data-placeholder="true"]') as HTMLElement;
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (el: EventTarget, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const pointerDown = (el: EventTarget) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }) as unknown as Event);

/** The items row's members in DOM order, as their data-pos values. */
const rowOrder = (scope: ParentNode): string[] =>
  [...scope.querySelectorAll('.cpnp-items > *')].map(
    (el) => el.getAttribute('data-pos') ?? el.getAttribute('data-placeholder') ?? '?',
  );

const segBtn = (scope: ParentNode, key: string): HTMLButtonElement =>
  scope.querySelector(`[data-pos="seg-${key}"]`) as HTMLButtonElement;

describe('custom segments — rendering', () => {
  it('renders [start][value][inc][dec][end][reset] for the default layout', () => {
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        onChange={() => {}}
        min={1}
        max={100}
        resetTo={1}
        segments={[
          { key: 'a', icon: 'A', label: 'A', position: 'start', onSelect: () => {} },
          { key: 'b', icon: 'B', label: 'B', onSelect: () => {} },
        ]}
      />
    ));
    expect(rowOrder(host)).toEqual(['seg-a', 'value', 'inc', 'dec', 'seg-b', 'seg-reset']);
  });

  it('preserves array order within a side; position defaults to end', () => {
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        onChange={() => {}}
        segments={[
          { key: 'x', icon: 'X', label: 'X', onSelect: () => {} },
          { key: 'y', icon: 'Y', label: 'Y', onSelect: () => {} },
        ]}
      />
    ));
    expect(rowOrder(host)).toEqual(['value', 'inc', 'dec', 'seg-x', 'seg-y']);
  });

  it('is a labelled .cpnp-btn with a per-segment width override', () => {
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        onChange={() => {}}
        segments={[{ key: 'max', icon: 'MAX', label: 'Set to maximum', width: 40, onSelect: () => {} }]}
      />
    ));
    const btn = segBtn(host, 'max');
    expect(btn.classList.contains('cpnp-btn')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Set to maximum');
    expect(btn.style.width).toBe('40px');
  });
});

describe('custom segments — api channel', () => {
  it('setValue publishes through onChange, clamped to [min,max]', () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        min={1}
        max={10}
        segments={[{ key: 'big', icon: 'B', label: 'Big', onSelect: (api) => api.setValue(999) }]}
      />
    ));
    click(segBtn(host, 'big'));
    expect(changes).toEqual([10]);
  });

  it('setValue is a no-op when the resolved value equals the current one', () => {
    const changes: number[] = [];
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        onChange={(n) => changes.push(n)}
        min={1}
        max={10}
        segments={[{ key: 'same', icon: 'S', label: 'Same', onSelect: (api) => api.setValue(5) }]}
      />
    ));
    click(segBtn(host, 'same'));
    expect(changes).toEqual([]);
  });

  it('setValue(0) under excludeZero resolves to the smallest step on the current side', () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(-3);
    const host = mount(() => (
      <PillNumberPicker
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        min={-10}
        max={10}
        excludeZero
        segments={[{ key: 'zero', icon: '0', label: 'Zero', onSelect: (api) => api.setValue(0) }]}
      />
    ));
    click(segBtn(host, 'zero'));
    // Current is negative → 0 resolves to −1, never an emitted 0.
    expect(changes).toEqual([-1]);
  });

  it('api.value is the click-time value', () => {
    let seen: number | null = null;
    const host = mount(() => (
      <PillNumberPicker
        value={7}
        onChange={() => {}}
        segments={[{ key: 'peek', icon: 'P', label: 'Peek', onSelect: (api) => { seen = api.value; } }]}
      />
    ));
    click(segBtn(host, 'peek'));
    expect(seen).toBe(7);
  });

  it('the disabled predicate tracks the current value reactively', () => {
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker
        value={v()}
        onChange={(n) => setV(n)}
        min={1}
        max={10}
        segments={[{ key: 'g', icon: 'G', label: 'G', disabled: (cur) => cur === 5, onSelect: () => {} }]}
      />
    ));
    expect(segBtn(host, 'g').disabled).toBe(true);
    // Step up via the inc button → predicate re-evaluates against 6.
    click(host.querySelector('[data-pos="inc"]')!);
    expect(segBtn(host, 'g').disabled).toBe(false);
  });

  it('a disabled root disables every segment regardless of predicate', () => {
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        onChange={() => {}}
        disabled
        segments={[{ key: 'd', icon: 'D', label: 'D', onSelect: () => {} }]}
      />
    ));
    expect(segBtn(host, 'd').disabled).toBe(true);
  });
});

describe('custom segments — session semantics', () => {
  function openSession(host: HTMLDivElement): HTMLElement {
    click(anchorValue(host));
    const p = panel();
    expect(p).not.toBeNull();
    return p!;
  }

  it("in a 'finish' session, setValue stays silent until the session commits", () => {
    const changes: number[] = [];
    const commits: number[] = [];
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker
        collapsible
        commit="finish"
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        onCommit={(n) => commits.push(n)}
        min={1}
        max={100}
        editable={false}
        segments={[{ key: 'set9', icon: '9', label: 'Nine', onSelect: (api) => api.setValue(9) }]}
      />
    ));
    const p = openSession(host);
    click(segBtn(p, 'set9'));
    expect(changes).toEqual([]); // silent while the session is open
    key(document, 'Escape'); // cancel — the draft is discarded
    expect(changes).toEqual([]);
    expect(commits).toEqual([]);

    // Again, but commit this time (click the anchor placeholder to confirm).
    const p2 = openSession(host);
    click(segBtn(p2, 'set9'));
    click(anchorValue(host));
    expect(changes).toEqual([9]);
    expect(commits).toEqual([9]);
  });

  it("in a 'change' session, cancel reverts a segment's edit", () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker
        collapsible
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        min={1}
        max={100}
        editable={false}
        segments={[{ key: 'set9', icon: '9', label: 'Nine', onSelect: (api) => api.setValue(9) }]}
      />
    ));
    const p = openSession(host);
    click(segBtn(p, 'set9'));
    expect(changes).toEqual([9]); // 'change' mode publishes live
    pointerDown(document.body); // outside press = implicit cancel
    expect(changes).toEqual([9, 5]); // revert published
  });

  it('api.commit() ends the session as a confirmation', () => {
    const commits: number[] = [];
    const [v, setV] = createSignal(5);
    const host = mount(() => (
      <PillNumberPicker
        collapsible
        value={v()}
        onChange={(n) => setV(n)}
        onCommit={(n) => commits.push(n)}
        min={1}
        max={100}
        editable={false}
        segments={[
          { key: 'done', icon: '✓', label: 'Done', onSelect: (api) => { api.setValue(8); api.commit(); } },
        ]}
      />
    ));
    const p = openSession(host);
    click(segBtn(p, 'done'));
    expect(panel()).toBeNull(); // session closed
    expect(commits).toEqual([8]);
  });

  it('api.commit() outside a session is a no-op (non-collapsible picker)', () => {
    const commits: number[] = [];
    const host = mount(() => (
      <PillNumberPicker
        value={5}
        onChange={() => {}}
        onCommit={(n) => commits.push(n)}
        segments={[{ key: 'c', icon: 'C', label: 'C', onSelect: (api) => api.commit() }]}
      />
    ));
    click(segBtn(host, 'c'));
    expect(commits).toEqual([]);
  });
});

describe('resetTo — sugar over the segment contract', () => {
  it('renders as seg-reset, outermost-last, disabled at the target', () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(3);
    const host = mount(() => (
      <PillNumberPicker
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        min={-10}
        max={10}
        resetTo={0}
        segments={[{ key: 'z', icon: 'Z', label: 'Z', onSelect: () => {} }]}
      />
    ));
    expect(rowOrder(host)).toEqual(['value', 'inc', 'dec', 'seg-z', 'seg-reset']);
    const reset = segBtn(host, 'reset');
    expect(reset.disabled).toBe(false);
    click(reset);
    expect(changes).toEqual([0]);
    expect(reset.disabled).toBe(true); // at target now
  });

  it('honors resetIcon and resetLabel', () => {
    const host = mount(() => (
      <PillNumberPicker value={3} onChange={() => {}} resetTo={1} resetIcon="R" resetLabel="Back to one" />
    ));
    const reset = segBtn(host, 'reset');
    expect(reset.textContent).toBe('R');
    expect(reset.getAttribute('aria-label')).toBe('Back to one');
  });

  it('clamps an out-of-range resetTo to the bounds', () => {
    const changes: number[] = [];
    const host = mount(() => (
      <PillNumberPicker value={5} onChange={(n) => changes.push(n)} min={1} max={10} resetTo={-50} />
    ));
    click(segBtn(host, 'reset'));
    expect(changes).toEqual([1]);
  });

  it("inside a 'finish' session the reset participates in commit/cancel", () => {
    const changes: number[] = [];
    const [v, setV] = createSignal(4);
    const host = mount(() => (
      <PillNumberPicker
        collapsible
        commit="finish"
        value={v()}
        onChange={(n) => { changes.push(n); setV(n); }}
        min={0}
        max={10}
        resetTo={0}
        editable={false}
      />
    ));
    click(anchorValue(host));
    const p = panel()!;
    click(segBtn(p, 'reset'));
    expect(changes).toEqual([]); // silent in the session
    key(document, 'Escape');
    expect(changes).toEqual([]); // cancel discards the draft entirely
  });
});
