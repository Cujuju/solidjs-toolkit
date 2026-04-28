import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent } from 'solid-js';
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
