import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHoverIntent, type HoverIntentApi } from '../_internal/hoverIntent';

/**
 * Tests for the hover-intent state machine that drives KvTooltip's
 * interactive mode.
 *
 * Each test wires the four event handlers + a setVisible spy + accessor
 * functions, then drives the state machine via the returned handlers. Fake
 * timers control hideDelayMs deterministically.
 */

interface Harness {
  api: HoverIntentApi;
  setVisible: ReturnType<typeof vi.fn>;
  setInteractive: (v: boolean) => void;
  setHideDelay: (ms: number) => void;
  setShouldShow: (v: boolean) => void;
}

function createHarness(initial: { interactive?: boolean; hideDelayMs?: number; shouldShow?: boolean } = {}): Harness {
  let interactive = initial.interactive ?? false;
  let hideDelayMs = initial.hideDelayMs ?? 100;
  let shouldShow = initial.shouldShow ?? true;
  const setVisible = vi.fn();
  const api = createHoverIntent({
    setVisible,
    shouldShow: () => shouldShow,
    interactive: () => interactive,
    hideDelayMs: () => hideDelayMs,
  });
  return {
    api,
    setVisible,
    setInteractive: (v) => { interactive = v; },
    setHideDelay: (ms) => { hideDelayMs = ms; },
    setShouldShow: (v) => { shouldShow = v; },
  };
}

describe('createHoverIntent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Contract: non-interactive default preserved ────────────────────────

  it('non-interactive: triggerLeave hides immediately (no timer involved)', () => {
    const h = createHarness({ interactive: false });
    h.api.onTriggerEnter();
    expect(h.setVisible).toHaveBeenLastCalledWith(true);

    h.api.onTriggerLeave();
    expect(h.setVisible).toHaveBeenLastCalledWith(false);
    expect(h.setVisible).toHaveBeenCalledTimes(2);
  });

  it('non-interactive: panelEnter / panelLeave are no-ops', () => {
    const h = createHarness({ interactive: false });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    h.api.onPanelEnter();
    h.api.onPanelLeave();
    expect(h.setVisible).not.toHaveBeenCalled();

    // No timer fires either.
    vi.advanceTimersByTime(1000);
    expect(h.setVisible).not.toHaveBeenCalled();
  });

  // ─── Contract: interactive debounces hide ───────────────────────────────

  it('interactive: triggerLeave defers hide by hideDelayMs (default 100ms)', () => {
    const h = createHarness({ interactive: true });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    h.api.onTriggerLeave();
    // Hide is armed but not fired.
    expect(h.setVisible).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(h.setVisible).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(h.setVisible).toHaveBeenCalledTimes(1);
    expect(h.setVisible).toHaveBeenCalledWith(false);
  });

  // ─── Contract: panel mouseenter cancels pending hide ─────────────────────

  it('interactive: panelEnter cancels a pending hide', () => {
    const h = createHarness({ interactive: true });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    h.api.onTriggerLeave();   // arm
    vi.advanceTimersByTime(50);
    h.api.onPanelEnter();     // cancel

    vi.advanceTimersByTime(200);
    expect(h.setVisible).not.toHaveBeenCalled();
  });

  // ─── Contract: panel mouseleave re-arms hide ────────────────────────────

  it('interactive: panelLeave re-arms hide after a previous panelEnter cancel', () => {
    const h = createHarness({ interactive: true });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    h.api.onTriggerLeave();
    vi.advanceTimersByTime(50);
    h.api.onPanelEnter();      // cancel
    h.api.onPanelLeave();      // re-arm

    vi.advanceTimersByTime(99);
    expect(h.setVisible).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(h.setVisible).toHaveBeenCalledTimes(1);
    expect(h.setVisible).toHaveBeenCalledWith(false);
  });

  // ─── Contract: trigger re-entry cancels pending hide ────────────────────

  it('interactive: triggerEnter cancels a pending hide and re-asserts visible', () => {
    const h = createHarness({ interactive: true });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    h.api.onTriggerLeave();         // arm
    vi.advanceTimersByTime(50);
    h.api.onTriggerEnter();          // user came back
    expect(h.setVisible).toHaveBeenLastCalledWith(true);

    vi.advanceTimersByTime(200);
    // setVisible(false) was never called — only the setVisible(true) from re-entry.
    expect(h.setVisible.mock.calls.filter(c => c[0] === false)).toHaveLength(0);
  });

  // ─── Contract: hideDelayMs accessor is read fresh on every arm ───────────

  it('interactive: hideDelayMs accessor is read at arm time, not at construction', () => {
    const h = createHarness({ interactive: true, hideDelayMs: 100 });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    // Change the delay BEFORE arming.
    h.setHideDelay(50);
    h.api.onTriggerLeave();

    vi.advanceTimersByTime(49);
    expect(h.setVisible).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.setVisible).toHaveBeenCalledTimes(1);
    expect(h.setVisible).toHaveBeenCalledWith(false);
  });

  // ─── Contract: shouldShow gates visibility ──────────────────────────────

  it('triggerEnter does not setVisible(true) when shouldShow returns false', () => {
    const h = createHarness({ shouldShow: false });
    h.api.onTriggerEnter();
    // shouldShow=false → no visibility change.
    expect(h.setVisible).not.toHaveBeenCalled();
  });

  // ─── Contract: cleanup cancels in-flight timer ──────────────────────────

  it('cleanup() cancels a pending hide so the deferred callback never fires', () => {
    const h = createHarness({ interactive: true });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    h.api.onTriggerLeave();
    h.api.cleanup();

    vi.advanceTimersByTime(1000);
    expect(h.setVisible).not.toHaveBeenCalled();
  });

  // ─── Contract: re-arming an existing armed hide resets the timer ────────

  it('arming a hide while one is already pending resets the timer (not stacks)', () => {
    const h = createHarness({ interactive: true });
    h.api.onTriggerEnter();
    h.setVisible.mockClear();

    h.api.onTriggerLeave();        // arm at t=0
    vi.advanceTimersByTime(80);    // 80ms later
    h.api.onPanelLeave();          // re-arm at t=80 (resets — should fire at t=180, not t=100)

    vi.advanceTimersByTime(99);    // t=179, still under
    expect(h.setVisible).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);     // t=180, fire
    expect(h.setVisible).toHaveBeenCalledTimes(1);
    expect(h.setVisible).toHaveBeenCalledWith(false);
  });
});
