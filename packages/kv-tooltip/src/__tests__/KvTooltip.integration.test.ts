import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent, createSignal } from 'solid-js';
import { KvTooltip } from '../KvTooltip';
import { DEFAULT_ANCHOR_GAP_PX } from '../clamp';

/**
 * Mounts KvTooltip in jsdom to lock what hoverIntent unit tests can't: handler wiring, and
 * the `interactive` CSS attribute agreeing with JS hide behaviour.
 */

const GAP = DEFAULT_ANCHOR_GAP_PX;

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
    // Regression lock: pre-fix, trigger mouseleave unmounted the panel before the pointer reached it.
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
    // styles.css keys pointer-events on [data-interactive="true"]; this locks the JS side so the
    // layers can't desync.

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

  it('re-measures the panel when the viewport resizes', () => {
    // The natural size is viewport-dependent (width capped at the viewport,
    // content rewraps taller), so a stale height mis-decides the flip.
    const NARROW_VW = 250;
    const WIDE_H = 60;
    const NARROW_H = 200;
    const rect = { top: 576, bottom: 600, left: 10, right: 130 } as DOMRect;
    const originalInnerWidth = window.innerWidth;
    const heightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(() => (window.innerWidth <= NARROW_VW ? NARROW_H : WIDE_H));
    const setInnerWidth = (value: number): void => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value });
      window.dispatchEvent(new Event('resize'));
    };

    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      anchor: rect,
      placement: 'below-start',
    });

    try {
      fire(getTrigger(container), 'mouseenter');
      expect(getPanel()!.style.top).toBe(`${rect.bottom + GAP}px`);

      setInnerWidth(NARROW_VW);   // re-wraps to NARROW_H: no longer fits below
      expect(getPanel()!.style.top).toBe(`${rect.top - NARROW_H - GAP}px`);
    } finally {
      dispose();
      heightSpy.mockRestore();
      setInnerWidth(originalInnerWidth);
    }
  });

  it('re-measures when extraContent reflows with no prop change', () => {
    // An image loading or a live row appearing inside `extraContent` changes the
    // panel's natural height without any tracked signal ticking.
    const SHORT_H = 60;
    const TALL_H = 200;
    const rect = { top: 576, bottom: 600, left: 10, right: 130 } as DOMRect;
    let panelHeight = SHORT_H;
    const heightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(() => panelHeight);
    const reflow: Array<() => void> = [];
    class StubResizeObserver {
      constructor(private readonly cb: () => void) {}
      observe(): void { reflow.push(() => this.cb()); }
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', StubResizeObserver);

    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      extraContent: 'prose',
      children: 'trigger',
      anchor: rect,
      placement: 'below-start',
    });

    try {
      fire(getTrigger(container), 'mouseenter');
      expect(getPanel()!.style.top).toBe(`${rect.bottom + GAP}px`);

      panelHeight = TALL_H;             // grew in place: no longer fits below
      expect(reflow).toHaveLength(1);
      reflow.forEach((fireReflow) => fireReflow());
      expect(getPanel()!.style.top).toBe(`${rect.top - TALL_H - GAP}px`);
    } finally {
      dispose();
      heightSpy.mockRestore();
      vi.unstubAllGlobals();
    }
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

  it('freezeOnShow keeps the held panel up when the live source empties mid-show', () => {
    // Visibility must be gated on the list the panel RENDERS, not the live one.
    const [quote, setQuote] = createSignal({ Bid: '412.18' });
    const { dispose, container } = renderTooltip({
      get entries() { return quote(); },
      children: 'trigger',
      freezeOnShow: true,
    });

    fire(getTrigger(container), 'mouseenter');
    expect(getPanel()!.textContent).toContain('412.18');

    setQuote({ Bid: '' });   // cleared bid; showEmpty=false empties the live list
    expect(getPanel()).not.toBeNull();
    expect(getPanel()!.textContent).toContain('412.18');

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

  // ─── Measurement must not leave the panel parked at the origin ──────────

  it('the measure pass restores the panel position it borrowed', () => {
    // measureNaturalSize borrows left: 0; a failed restore pins every panel to the left edge.
    // jsdom has no layout, so only the restore is assertable.
    const OFFSET_X = 12;
    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
    });

    fire(getTrigger(container), 'mouseenter');
    expect(getPanel()!.style.left).toBe(`${100 + OFFSET_X}px`);
    expect(getPanel()!.style.left).not.toBe('0px');

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

  // ─── Dismissal: scroll ──────────────────────────────────────────────────

  it('hideOnScroll: a scroll in a nested container dismisses the panel', () => {
    // `scroll` does not bubble out of a nested scroller — the capture-phase
    // window listener is what makes this case reachable at all.
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);

    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
      hideOnScroll: true,
    });

    fire(getTrigger(container), 'mouseenter');
    expect(getPanel()).not.toBeNull();

    scroller.dispatchEvent(new Event('scroll'));   // bubbles: false, on purpose
    expect(getPanel()).toBeNull();

    dispose();
    scroller.remove();
  });

  it('without hideOnScroll the panel survives a scroll (0.1.x behaviour)', () => {
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);

    const { dispose, container } = renderTooltip({
      entries: { Foo: 'Bar' },
      children: 'trigger',
    });

    fire(getTrigger(container), 'mouseenter');
    scroller.dispatchEvent(new Event('scroll'));
    expect(getPanel()).not.toBeNull();

    dispose();
    scroller.remove();
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
