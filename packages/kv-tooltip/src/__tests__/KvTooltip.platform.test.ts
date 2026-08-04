import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent, type JSX } from 'solid-js';
import { KvTooltip, KvTooltipPanel } from '../KvTooltip';
import { isTopLayerSurfaceOpen } from '../_internal/topLayer';

/**
 * PLATFORM CONTRACT (0.7.0 — `popover="hint"`).
 *
 * The panel is promoted into the browser's top layer, and the platform can
 * close it out from under us: another tooltip takes the single hint slot, an
 * `auto` popover opens, the user clicks outside or presses Escape. jsdom has no
 * Popover API at all, so what is testable HERE is deliberately not the
 * platform's behaviour (that is `playground/e2e/topLayer.spec.ts`) but OUR side
 * of the contract:
 *
 *   - the DEGRADED path — no `showPopover` at all — must render a working,
 *     visible tooltip and must never leave a `popover` attribute behind;
 *   - the `toggle` handler must demote + notify on a real close, ignore an
 *     open, and re-read the element rather than trusting a queued event;
 *   - Escape must be marked consumed only when it actually hid something.
 *
 * The handler is reachable here at all because the listener is attached
 * unconditionally in the ref (see KvTooltip.tsx) rather than only on a
 * successful promotion — that is what makes this file possible.
 */

/** The private identity marker every panel carries; see `_internal/topLayer.ts`. */
const PANEL_ATTRIBUTE = 'data-ckv-tooltip-panel';

/** The popover type the component promotes with. Mirrored, not imported: the
 *  component's constant is internal, and a test that imported it could not
 *  catch a change to it. */
const EXPECTED_POPOVER_TYPE = 'hint';

function mount(component: () => JSX.Element): () => void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(component, container);
  return () => {
    dispose();
    container.remove();
  };
}

/** Mount the hover wrapper and hand back its trigger `<span>`. */
function mountWrapper(): { trigger: HTMLElement; dispose: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(
    () => createComponent(KvTooltip, { entries: { Bid: '1.00' }, children: 'trigger' }),
    container,
  );
  const trigger = container.querySelector('span');
  if (!trigger) throw new Error('expected wrapper <span> trigger');
  return {
    trigger,
    dispose: () => {
      dispose();
      container.remove();
    },
  };
}

function getPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${PANEL_ATTRIBUTE}]`);
}

function requirePanel(): HTMLElement {
  const panel = getPanel();
  if (!panel) throw new Error('expected a mounted tooltip panel');
  return panel;
}

function fire(el: EventTarget, type: 'mouseenter' | 'mouseleave'): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 100 }));
}

/**
 * A `toggle` event carrying a `newState`. `ToggleEvent` does not exist in
 * jsdom, and `newState` is a readonly accessor on the real interface, so the
 * property is defined on a plain `Event` — which is exactly what the handler
 * reads.
 */
function toggleEvent(newState: string): Event {
  const e = new Event('toggle');
  Object.defineProperty(e, 'newState', { value: newState });
  return e;
}

/** Let the ref's `queueMicrotask` promotion attempt run before asserting. */
async function afterPromotionAttempt(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll(`[${PANEL_ATTRIBUTE}]`).forEach((el) => el.remove());
});

describe('degraded path (no Popover API — the jsdom case, and every old engine)', () => {
  it('renders the entries and leaves NO popover attribute behind', async () => {
    // `[popover]:not(:popover-open)` is `display: none` in the UA sheet, so an
    // attribute left on an element that never opened is an INVISIBLE tooltip —
    // strictly worse than one painted under a menu. The attribute is therefore
    // written only around a `showPopover()` that actually succeeded.
    expect(typeof (document.createElement('div') as HTMLElement).showPopover).not.toBe('function');

    const dispose = mount(() =>
      createComponent(KvTooltipPanel, { entries: { Bid: '412.18' }, x: 10, y: 10 }),
    );
    await afterPromotionAttempt();

    const panel = requirePanel();
    expect(panel.hasAttribute('popover')).toBe(false);
    expect(panel.textContent).toContain('412.18');
    dispose();
  });

  it('the hover wrapper shows and hides normally without a Popover API', async () => {
    const { trigger, dispose } = mountWrapper();

    fire(trigger, 'mouseenter');
    await afterPromotionAttempt();
    expect(getPanel()).not.toBeNull();
    expect(getPanel()!.hasAttribute('popover')).toBe(false);

    fire(trigger, 'mouseleave');
    expect(getPanel()).toBeNull();

    dispose();
  });
});

describe('the toggle handler (platform dismissal)', () => {
  /**
   * Mount a controlled panel with a spy for `onPlatformDismiss`, then put it in
   * the state a SUCCESSFUL promotion would have left it in. jsdom cannot
   * promote anything, so the attribute is set by hand — the handler's contract
   * is about the attribute and the callback, not about how the attribute got
   * there.
   */
  function mountPromotedPanel(): {
    panel: HTMLElement;
    onPlatformDismiss: ReturnType<typeof vi.fn>;
    dispose: () => void;
  } {
    const onPlatformDismiss = vi.fn();
    const dispose = mount(() =>
      createComponent(KvTooltipPanel, {
        entries: { Bid: '412.18' },
        x: 10,
        y: 10,
        onPlatformDismiss,
      }),
    );
    const panel = requirePanel();
    panel.setAttribute('popover', EXPECTED_POPOVER_TYPE);
    return { panel, onPlatformDismiss, dispose };
  }

  it("newState 'closed' demotes the panel and notifies the owner exactly once", () => {
    const { panel, onPlatformDismiss, dispose } = mountPromotedPanel();

    panel.dispatchEvent(toggleEvent('closed'));

    // DEMOTED, not hidden: the element falls back to the 0.5.x fixed/z-index
    // box. Painted under a menu is a degradation; mounted-but-invisible is a
    // lie about state.
    expect(panel.hasAttribute('popover')).toBe(false);
    expect(panel.isConnected).toBe(true);
    expect(onPlatformDismiss).toHaveBeenCalledTimes(1);

    dispose();
  });

  it("newState 'open' is ignored entirely", () => {
    const { panel, onPlatformDismiss, dispose } = mountPromotedPanel();

    panel.dispatchEvent(toggleEvent('open'));

    expect(panel.getAttribute('popover')).toBe(EXPECTED_POPOVER_TYPE);
    expect(onPlatformDismiss).not.toHaveBeenCalled();

    dispose();
  });

  it('re-reads the element instead of trusting the event: a still-open popover is NOT demoted', () => {
    // `toggle` is QUEUED, so a close and a re-open inside one task can arrive as
    // one event. Acting on the event alone would strip the attribute off a
    // popover that is currently open — i.e. hide a visible tooltip. jsdom
    // cannot express `:popover-open`, so the ONLY way to exercise the
    // still-open branch is to answer the selector the way a real engine would.
    const { panel, onPlatformDismiss, dispose } = mountPromotedPanel();
    const matches = vi
      .spyOn(panel, 'matches')
      .mockImplementation((selector: string) => selector === ':popover-open');

    panel.dispatchEvent(toggleEvent('closed'));

    expect(matches).toHaveBeenCalledWith(':popover-open');
    expect(panel.getAttribute('popover')).toBe(EXPECTED_POPOVER_TYPE);
    expect(onPlatformDismiss).not.toHaveBeenCalled();

    dispose();
  });

  it('an engine that cannot parse :popover-open is treated as "not open"', () => {
    // jsdom throws SyntaxError on the pseudo-class. That engine cannot have put
    // anything in the top layer either, so the safe branch is to demote — which
    // can only make the panel MORE visible.
    const { panel, onPlatformDismiss, dispose } = mountPromotedPanel();
    expect(() => panel.matches(':popover-open')).toThrow();

    panel.dispatchEvent(toggleEvent('closed'));

    expect(panel.hasAttribute('popover')).toBe(false);
    expect(onPlatformDismiss).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('a repeated close notifies again — de-duplication is the OWNER\'s job', () => {
    // Pinning implemented behaviour, not endorsing a design: the handler has no
    // "already dismissed" memory, so a second `toggle('closed')` on a panel the
    // caller left mounted calls back a second time. Both consumers are
    // idempotent — the wrapper passes `hideNow` (which just re-asserts
    // `visible = false`), and a controlled caller sets its own flag false. If
    // that ever stops being true, this test is where the assumption is written
    // down.
    const { panel, onPlatformDismiss, dispose } = mountPromotedPanel();

    panel.dispatchEvent(toggleEvent('closed'));
    panel.dispatchEvent(toggleEvent('closed'));

    expect(onPlatformDismiss).toHaveBeenCalledTimes(2);
    expect(panel.hasAttribute('popover')).toBe(false);

    dispose();
  });

  it('the wrapper resyncs: a platform close UNMOUNTS the panel', () => {
    // The wrapper passes `hideNow`, so the demoted frame the handler leaves
    // behind lasts at most one paint. Without this the wrapper would still
    // believe it is showing a panel the browser took away, and the next hover
    // would be a no-op because `visible()` never went false.
    const { trigger, dispose } = mountWrapper();

    fire(trigger, 'mouseenter');
    const panel = requirePanel();
    panel.setAttribute('popover', EXPECTED_POPOVER_TYPE);

    panel.dispatchEvent(toggleEvent('closed'));
    expect(getPanel()).toBeNull();

    dispose();
  });
});

describe('Escape (the layering contract)', () => {
  function pressEscape(): boolean {
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    return e.defaultPrevented;
  }

  it('marks the key CONSUMED when it actually hid a visible panel', () => {
    // A tooltip is very often open on top of a menu and both want Escape.
    // `preventDefault` is what makes the rule innermost-first: AnchoredPopover's
    // bubble-phase handler skips a defaultPrevented event, so the first Escape
    // kills the tooltip and the second kills the menu.
    const { trigger, dispose } = mountWrapper();

    fire(trigger, 'mouseenter');
    expect(getPanel()).not.toBeNull();

    expect(pressEscape()).toBe(true);
    expect(getPanel()).toBeNull();

    dispose();
  });

  it('leaves the key alone when there is no visible panel', () => {
    // The listener exists only while a panel does. An Escape swallowed by a
    // tooltip that is not on screen would silently eat the menu's dismissal.
    const { dispose } = mountWrapper();

    expect(pressEscape()).toBe(false);

    dispose();
  });
});

describe('the top-layer probe excludes our own panels', () => {
  it('queries with a :not([data-ckv-tooltip-panel]) exclusion', () => {
    // The 0.6.0 self-poisoning bug: promoting our own panel made it match the
    // bare `[popover]:popover-open`, so any visible tooltip reported "a
    // top-layer surface is open" and `suppressWhileTopLayerOpen` degenerated
    // into "only one tooltip on the page, ever".
    //
    // jsdom cannot parse `:popover-open`, so the BEHAVIOUR is e2e's job (T8 /
    // T8b in `playground/e2e/topLayer.spec.ts`). What is lockable here is the
    // query the helper actually issues — read from the seam the helper uses
    // rather than from the module's private constant, so a refactor that stops
    // going through `document.querySelector` fails loudly instead of passing on
    // a string nobody reads any more.
    const spy = vi.spyOn(document, 'querySelector').mockReturnValue(null);

    isTopLayerSurfaceOpen();

    expect(spy).toHaveBeenCalledTimes(1);
    const selector = spy.mock.calls[0]![0] as string;
    expect(selector).toContain(':popover-open');
    expect(selector).toContain(`:not([${PANEL_ATTRIBUTE}])`);
  });
});
