import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import { FLYOUT_HOVER_ENTER_DELAY_MS } from '../autoHide';
import type { AccordionGroupApi } from '../context';

/**
 * THE HOVER-OPEN DELAY IS A HOST DECISION, and these assert the boundary between
 * the part that is and the part that is not.
 *
 * The 350ms default is sized for the horizontal RAIL, where reaching one button
 * means hovering every button above it in passing; the delay is the only thing
 * stopping that traverse from leaving a wake of overlays. A dock whose
 * activators are not on a traverse path — a two-section vertical sidebar — is
 * paying for a hazard it does not have, so the number is a prop.
 *
 * What is asserted is that the prop REPLACES the default rather than being
 * clamped, added to, or ignored, and that a nonsense value falls back to the
 * default instead of silently becoming zero. `setTimeout` treats a negative
 * delay as "next tick", so an unguarded override would turn a typo into "no
 * hover intent at all" — the exact failure the default exists to prevent, and
 * invisible when it happens.
 */

const OVERRIDE_MS = 50;

function mountHoverGroup(hoverOpenDelayMs?: number) {
  let api!: AccordionGroupApi;
  const container = document.createElement('div');
  document.body.appendChild(container);

  const dispose = render(
    () => (
      <AccordionGroup
        orientation="vertical"
        policy="multi"
        autoHide
        hoverToOpen
        hoverOpenDelayMs={hoverOpenDelayMs}
        apiRef={(a) => (api = a)}
      >
        <AccordionPanel id="a" title="A">
          <div>a body</div>
        </AccordionPanel>
        <AccordionPanel id="b" title="B">
          <div>b body</div>
        </AccordionPanel>
      </AccordionGroup>
    ),
    container,
  );

  const headers = () =>
    Array.from(container.querySelectorAll('.acc-header-row')) as HTMLElement[];

  return {
    api: () => api,
    /* `pointerenter` does not bubble, so this must be dispatched on the header
       itself — which is also where the handler is attached, making the test
       exercise the real wiring rather than a synthesised path. A plain Event
       carries no `pointerType`, which reads as not-touch and is the case under
       test; the touch branch has its own coverage elsewhere. */
    hoverFirstHeader: () =>
      headers()[0]?.dispatchEvent(new Event('pointerenter', { bubbles: false })),
    unmount: () => {
      dispose();
      container.remove();
    },
  };
}

describe('hover-open delay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits the DEFAULT when the prop is absent', () => {
    const g = mountHoverGroup();
    g.hoverFirstHeader();

    vi.advanceTimersByTime(FLYOUT_HOVER_ENTER_DELAY_MS - 1);
    expect(g.api().isOpen('a')).toBe(false);

    vi.advanceTimersByTime(1);
    expect(g.api().isOpen('a')).toBe(true);
    g.unmount();
  });

  it('waits the OVERRIDE when the prop is set, and no longer', () => {
    const g = mountHoverGroup(OVERRIDE_MS);
    g.hoverFirstHeader();

    vi.advanceTimersByTime(OVERRIDE_MS - 1);
    expect(g.api().isOpen('a')).toBe(false);

    vi.advanceTimersByTime(1);
    expect(g.api().isOpen('a')).toBe(true);
    g.unmount();
  });

  it('opens IMMEDIATELY on the next tick at 0 — an explicit opt-out of hover intent', () => {
    const g = mountHoverGroup(0);
    g.hoverFirstHeader();

    expect(g.api().isOpen('a')).toBe(false); // still a timer, not synchronous
    vi.advanceTimersByTime(0);
    expect(g.api().isOpen('a')).toBe(true);
    g.unmount();
  });

  it('falls back to the default on a NEGATIVE override rather than firing at once', () => {
    const g = mountHoverGroup(-1);
    g.hoverFirstHeader();

    // The unguarded bug: setTimeout(-1) is setTimeout(0), so this would already
    // be open a tick in.
    vi.advanceTimersByTime(0);
    expect(g.api().isOpen('a')).toBe(false);

    vi.advanceTimersByTime(FLYOUT_HOVER_ENTER_DELAY_MS);
    expect(g.api().isOpen('a')).toBe(true);
    g.unmount();
  });

  it('falls back to the default on a NON-FINITE override rather than never firing', () => {
    const g = mountHoverGroup(Number.NaN);
    g.hoverFirstHeader();

    vi.advanceTimersByTime(FLYOUT_HOVER_ENTER_DELAY_MS);
    expect(g.api().isOpen('a')).toBe(true);
    g.unmount();
  });
});
