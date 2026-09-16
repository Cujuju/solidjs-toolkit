import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent, createSignal, type JSX } from 'solid-js';
import { KvTooltip, KvTooltipPanel } from '../KvTooltip';
import { isTopLayerSurfaceOpen } from '../_internal/topLayer';
import AnchoredPopover from '../../../anchored-popover/src/AnchoredPopover';

/**
 * Platform contract (`popover="hint"`). jsdom has no Popover API, so this tests OUR side: the
 * degraded path, the `toggle` demote handler, and Escape consumption. Platform behaviour is e2e.
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

/** jsdom lacks `ToggleEvent` and `newState` is readonly on the real one, so it's defined on a plain `Event`. */
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
    // `[popover]:not(:popover-open)` is `display: none`, so the attribute is written only around a
    // successful `showPopover()`.
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
  /** Mount a controlled panel and set the attribute a successful promotion would leave; jsdom can't promote. */
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
    // `toggle` is queued, so close+reopen can arrive as one event. jsdom can't express
    // `:popover-open`, so the selector answer is stubbed.
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
    // jsdom throws on the pseudo-class; such an engine has nothing in the top layer, so demoting is safe.
    const { panel, onPlatformDismiss, dispose } = mountPromotedPanel();
    expect(() => panel.matches(':popover-open')).toThrow();

    panel.dispatchEvent(toggleEvent('closed'));

    expect(panel.hasAttribute('popover')).toBe(false);
    expect(onPlatformDismiss).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('a repeated close notifies again — de-duplication is the OWNER\'s job', () => {
    // Pins current behaviour: no "already dismissed" memory, so a second close calls back again.
    // Both consumers are idempotent.
    const { panel, onPlatformDismiss, dispose } = mountPromotedPanel();

    panel.dispatchEvent(toggleEvent('closed'));
    panel.dispatchEvent(toggleEvent('closed'));

    expect(onPlatformDismiss).toHaveBeenCalledTimes(2);
    expect(panel.hasAttribute('popover')).toBe(false);

    dispose();
  });

  it('the wrapper resyncs: a platform close UNMOUNTS the panel', () => {
    // Wrapper passes `hideNow`; otherwise `visible()` stays true and the next hover is a no-op.
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
    // The shown tooltip is the top of the shared Escape stack: it hides alone, so the menu
    // (an AnchoredPopover opened first) survives.
    // AnchoredPopover needs the Popover API; stubbed for this case only (jsdom has none).
    const proto = HTMLElement.prototype as Partial<Record<'showPopover' | 'hidePopover', () => void>>;
    proto.showPopover = () => {};
    proto.hidePopover = () => {};
    const originalMatches = HTMLElement.prototype.matches;
    HTMLElement.prototype.matches = function (this: HTMLElement, selectors: string): boolean {
      return selectors === ':popover-open' ? false : originalMatches.call(this, selectors);
    };
    const cleanups: Array<() => void> = [];
    try {
      const menuDismiss = vi.fn();
      const menuAnchor = document.createElement('button');
      document.body.appendChild(menuAnchor);
      cleanups.push(() => menuAnchor.remove());
      cleanups.push(mount(() =>
        createComponent(AnchoredPopover, {
          open: () => true,
          anchor: () => menuAnchor,
          onDismiss: menuDismiss,
          get children() {
            return 'menu';
          },
        }),
      ));
      const { trigger, dispose } = mountWrapper();
      cleanups.push(dispose);

      fire(trigger, 'mouseenter');
      expect(getPanel()).not.toBeNull();

      expect(pressEscape()).toBe(true);
      expect(getPanel()).toBeNull();
      expect(menuDismiss, 'one Escape closed the menu under the tooltip too').not.toHaveBeenCalled();
    } finally {
      while (cleanups.length) cleanups.pop()!();
      delete proto.showPopover;
      delete proto.hidePopover;
      HTMLElement.prototype.matches = originalMatches;
    }
  });

  it('leaves the key alone when there is no visible panel', () => {
    // The listener exists only while a panel does. An Escape swallowed by a
    // tooltip that is not on screen would silently eat the menu's dismissal.
    const { dispose } = mountWrapper();

    expect(pressEscape()).toBe(false);

    dispose();
  });

  it('leaves the key alone when the panel was withdrawn mid-show (disabled flipped)', () => {
    // The panel unmounts without a hover-intent hide, so `visible` alone is
    // not proof that anything is on screen.
    const [disabled, setDisabled] = createSignal(false);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () =>
        createComponent(KvTooltip, {
          entries: { Bid: '1.00' },
          get disabled() { return disabled(); },
          children: 'trigger',
        }),
      container,
    );
    const trigger = container.querySelector('span')!;

    fire(trigger, 'mouseenter');
    expect(getPanel()).not.toBeNull();

    setDisabled(true);
    expect(getPanel()).toBeNull();
    expect(pressEscape()).toBe(false);

    dispose();
    container.remove();
  });
});

describe('the top-layer probe excludes our own panels', () => {
  it('queries with a :not([data-ckv-tooltip-panel]) exclusion', () => {
    // 0.6.0 bug: our promoted panel matched `[popover]:popover-open`, so tooltips suppressed each
    // other. jsdom can't parse it; lock the issued query (behaviour is e2e).
    const spy = vi.spyOn(document, 'querySelector').mockReturnValue(null);

    isTopLayerSurfaceOpen();

    expect(spy).toHaveBeenCalledTimes(1);
    const selector = spy.mock.calls[0]![0] as string;
    expect(selector).toContain(':popover-open');
    expect(selector).toContain(`:not([${PANEL_ATTRIBUTE}])`);
  });
});
