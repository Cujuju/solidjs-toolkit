import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent, createSignal } from 'solid-js';
import { KvTooltip } from '../KvTooltip';

/**
 * Integration tests — mount the actual KvTooltip component in jsdom and
 * exercise the trigger/panel event flow end-to-end. These cover what the
 * hoverIntent unit tests can't:
 *
 *  1. The wiring between the helper and the JSX. If a future refactor
 *     misnames a handler (passes onTriggerEnter to onMouseLeave, etc.),
 *     unit tests pass and these fail.
 *
 *  2. The CSS / JS contract for the `interactive` prop. Bug history: this
 *     prop was wired in CSS (`pointer-events: auto` via
 *     `[data-interactive="true"]`) but JS hid the panel on mouseleave,
 *     making the panel unreachable. The test asserts both the
 *     data-attribute presence (CSS contract) AND the hide behavior
 *     (JS contract) — preventing future drift between the two layers.
 */

function renderTooltip(props: Parameters<typeof KvTooltip>[0]): { dispose: () => void; container: HTMLDivElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(() => createComponent(KvTooltip, props), container);
  return {
    dispose: () => {
      dispose();
      container.remove();
    },
    container,
  };
}

function getTrigger(container: HTMLElement): HTMLElement {
  const trigger = container.querySelector('span');
  if (!trigger) throw new Error('expected wrapper <span> trigger');
  return trigger;
}

function getPanel(): HTMLElement | null {
  return document.querySelector('.ckv-panel');
}

function fire(el: EventTarget, type: 'mouseenter' | 'mouseleave' | 'mousemove'): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 100 }));
}

describe('KvTooltip (integration)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.ckv-panel').forEach((el) => el.remove());
  });

  // ─── Wiring contract: helper handlers connected to correct events ───────

  it('non-interactive: trigger mouseenter shows panel; mouseleave hides immediately', () => {
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
    });
    const trigger = getTrigger(container);

    fire(trigger, 'mouseenter');
    fire(trigger, 'mousemove');
    expect(getPanel()).not.toBeNull();

    fire(trigger, 'mouseleave');
    expect(getPanel()).toBeNull();

    dispose();
  });

  it('interactive: hide is debounced by default 100ms', () => {
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      interactive: true,
    });
    const trigger = getTrigger(container);

    fire(trigger, 'mouseenter');
    fire(trigger, 'mousemove');
    expect(getPanel()).not.toBeNull();

    fire(trigger, 'mouseleave');
    vi.advanceTimersByTime(99);
    expect(getPanel()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getPanel()).toBeNull();

    dispose();
  });

  it('interactive: panel mouseenter cancels pending hide (the original bug, regression-locked)', () => {
    // This test is the regression lock for the exact bug the fix addresses.
    // Pre-fix: trigger mouseleave → panel unmounted immediately → user
    // never reached panel → panel mouseenter never fired. The test would
    // have failed because the panel wouldn't exist to dispatch on.
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      interactive: true,
    });
    const trigger = getTrigger(container);

    fire(trigger, 'mouseenter');
    fire(trigger, 'mousemove');
    fire(trigger, 'mouseleave');           // arm hide

    vi.advanceTimersByTime(50);            // mid-flight
    const panel = getPanel();
    expect(panel).not.toBeNull();          // proves: panel still in DOM during traversal

    fire(panel!, 'mouseenter');             // user crossed the gap → cancel hide

    vi.advanceTimersByTime(500);            // well past 100ms
    expect(getPanel()).not.toBeNull();      // still there, panel is reachable

    dispose();
  });

  it('interactive: hideDelayMs prop overrides the default', () => {
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      interactive: true,
      hideDelayMs: 50,
    });
    const trigger = getTrigger(container);

    fire(trigger, 'mouseenter');
    fire(trigger, 'mousemove');
    fire(trigger, 'mouseleave');
    vi.advanceTimersByTime(49);
    expect(getPanel()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getPanel()).toBeNull();

    dispose();
  });

  // ─── CSS / JS contract: data-interactive matches the prop ───────────────

  it('data-interactive attribute matches the interactive prop (CSS / JS layer agreement)', () => {
    // Why this test exists: the original bug was CSS and JS layers each
    // implementing half of `interactive` and disagreeing. styles.css uses
    // [data-interactive="true"] to set pointer-events: auto. This test
    // asserts the JS layer sets the attribute correctly so future
    // refactors that rename the prop or change the JSX wiring can't
    // silently desync the two layers.

    // interactive=false (default): no attribute or attribute is undefined
    {
      const { dispose, container } = renderTooltip({
        entries: { Foo: 'Bar' },
        children: 'trigger',
      });
      fire(getTrigger(container), 'mouseenter');
      fire(getTrigger(container), 'mousemove');
      const panel = getPanel();
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute('data-interactive')).toBeNull();
      dispose();
    }

    // interactive=true: attribute set to 'true'
    {
      const { dispose, container } = renderTooltip({
        entries: { Foo: 'Bar' },
        children: 'trigger',
        interactive: true,
      });
      fire(getTrigger(container), 'mouseenter');
      fire(getTrigger(container), 'mousemove');
      const panel = getPanel();
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute('data-interactive')).toBe('true');
      dispose();
    }
  });

  // ─── Anchored placement: the rect wins over the cursor point ────────────

  it('anchor + placement position the panel from the rect, ignoring the cursor', () => {
    // jsdom reports offsetWidth/offsetHeight as 0, so the panel falls back to
    // its 150x100 assumed size — enough to prove which reference was used.
    const ASSUMED_H = 100;
    const GAP = 4; // DEFAULT_ANCHOR_GAP_PX
    const rect = { top: 400, bottom: 424, left: 300, right: 420 } as DOMRect;

    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      anchor: rect,
      placement: 'above-start',
    });

    fire(getTrigger(container), 'mouseenter');   // fires at clientX/Y = 100
    fire(getTrigger(container), 'mousemove');
    const panel = getPanel();
    expect(panel).not.toBeNull();
    expect(panel!.style.top).toBe(`${rect.top - ASSUMED_H - GAP}px`);
    expect(panel!.style.left).toBe(`${rect.left}px`);

    dispose();
  });

  it('anchor near the top edge flips below the rect instead of onto it', () => {
    const GAP = 4;
    const rect = { top: 10, bottom: 34, left: 300, right: 420 } as DOMRect;

    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      anchor: rect,
      placement: 'above-start',
    });

    fire(getTrigger(container), 'mouseenter');
    const panel = getPanel();
    expect(panel!.style.top).toBe(`${rect.bottom + GAP}px`);

    dispose();
  });

  // ─── freezeOnShow: content + position held for the life of one show ──────

  it('freezeOnShow holds the entries captured at show time while a live source ticks', () => {
    const [quote, setQuote] = createSignal({ Bid: '1.00' });
    const { dispose, container } = renderTooltip({
      get entries() { return quote(); },
      children: 'trigger',
      freezeOnShow: true,
    });

    fire(getTrigger(container), 'mouseenter');
    expect(getPanel()!.textContent).toContain('1.00');

    setQuote({ Bid: '2.00' });                       // source ticks under a stationary cursor
    expect(getPanel()!.textContent).toContain('1.00'); // held
    expect(getPanel()!.textContent).not.toContain('2.00');

    // Hiding releases the freeze; the next show captures the current value.
    fire(getTrigger(container), 'mouseleave');
    expect(getPanel()).toBeNull();
    fire(getTrigger(container), 'mouseenter');
    expect(getPanel()!.textContent).toContain('2.00');

    dispose();
  });

  it('without freezeOnShow the panel still tracks a live entries source (0.1.0 behaviour)', () => {
    const [quote, setQuote] = createSignal({ Bid: '1.00' });
    const { dispose, container } = renderTooltip({
      get entries() { return quote(); },
      children: 'trigger',
    });

    fire(getTrigger(container), 'mouseenter');
    expect(getPanel()!.textContent).toContain('1.00');

    setQuote({ Bid: '2.00' });
    expect(getPanel()!.textContent).toContain('2.00');

    dispose();
  });

  it('freezeOnShow holds the cursor point captured at show time', () => {
    const OFFSET_X = 12;
    const OFFSET_Y = 16;
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      freezeOnShow: true,
    });
    const trigger = getTrigger(container);

    fire(trigger, 'mouseenter');  // clientX/Y = 100 (see `fire`)
    const frozenTop = getPanel()!.style.top;
    const frozenLeft = getPanel()!.style.left;
    expect(frozenLeft).toBe(`${100 + OFFSET_X}px`);
    expect(frozenTop).toBe(`${100 + OFFSET_Y}px`);

    // Move the cursor a long way — the panel must not follow.
    trigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 500, clientY: 400 }));
    expect(getPanel()!.style.left).toBe(frozenLeft);
    expect(getPanel()!.style.top).toBe(frozenTop);

    dispose();
  });

  // ─── Dismissal: pointerdown wiring ──────────────────────────────────────

  it('hideOnPointerDown: pointerdown on the trigger hides the panel', () => {
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      hideOnPointerDown: true,
    });
    const trigger = getTrigger(container);

    fire(trigger, 'mouseenter');
    expect(getPanel()).not.toBeNull();

    // Solid delegates pointerdown at the document, so the event must bubble.
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(getPanel()).toBeNull();

    dispose();
  });

  it('without hideOnPointerDown, pointerdown leaves the panel up (0.1.x behaviour)', () => {
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
    });
    const trigger = getTrigger(container);

    fire(trigger, 'mouseenter');
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(getPanel()).not.toBeNull();

    dispose();
  });

  // ─── Disabled gate works through the helper ─────────────────────────────

  it('disabled prop suppresses panel even on trigger mouseenter', () => {
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      disabled: true,
    });

    fire(getTrigger(container), 'mouseenter');
    fire(getTrigger(container), 'mousemove');
    expect(getPanel()).toBeNull();

    dispose();
  });
});
