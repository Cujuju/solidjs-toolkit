import { createSignal, createEffect, onCleanup } from 'solid-js';
import { createEscapeOwner } from '@cujuju/solidjs-hooks';
import { parseValue, formatValue } from './_internal/precision';
import { resolvePopoutPosition, POPOUT_DEFAULT_GAP_PX, type PopoutPosition } from './_internal/popout';
import { createAutoRepeat } from './_internal/autoRepeat';
import type { PillNumberPickerProps } from './types';
import type { createPickerSession } from './createPickerSession';

/** PageUp/PageDown move ±step×10, as documented in the README (Keyboard). */
const PAGE_STEPS = 10;

export function createPickerInteraction(props: PillNumberPickerProps, s: ReturnType<typeof createPickerSession>) {
  const [popout, setPopout] = createSignal<PopoutPosition | null>(null);
  /**
   * Measure and place the panel. Re-runs on scroll and resize because the panel is
   * `position: fixed`; `scroll` is CAPTURED, since the scrolling ancestor is rarely `window`.
   */
  const place = (): void => {
    if (!s.anchorEl || !s.panelEl) return;
    const a = s.anchorEl.getBoundingClientRect();
    const p = s.panelEl.getBoundingClientRect();
    setPopout(
      resolvePopoutPosition(
        { top: a.top, left: a.left, width: a.width, height: a.height },
        { width: p.width, height: p.height },
        { width: window.innerWidth, height: window.innerHeight },
        props.popoutGap ?? POPOUT_DEFAULT_GAP_PX,
      ),
    );
  };

  /**
   * Dismissal + repositioning, live only while the pop-out is open. Outside-press closes on
   * `pointerdown`, not `click`, which fires too late to stop a neighbouring control.
   */
  createEffect(() => {
    if (!s.isOpen() || !s.collapsible()) {
      setPopout(null);
      return;
    }
    place();

    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (s.panelEl?.contains(t)) return;
      if (s.anchorEl?.contains(t)) return; // the anchor's own click toggles; don't double-handle
      // Outside pointerdown abandons the edit before browser focus moves; closing must not restore focus.
      s.cancelSession({ restoreFocus: false });
    };
    const onReflow = (): void => place();

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onReflow);
    // Capture: the scroll that moves us is almost never on `window`.
    window.addEventListener('scroll', onReflow, true);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    });
  });

  /** The topmost pop-out owns Escape across the toolkit. Closing or unmounting releases ownership. */
  createEscapeOwner({
    open: s.sessionOpen,
    // Return focus to where the user was, or the close is a dead end for the keyboard.
    onDismiss: () => s.cancelSession({ restoreFocus: true }),
    // The value editor inside the pop-out handles its own Escape first.
    owns: () => [s.panelEl],
  });

  createEffect(() => {
    // `current()`, not `props.value` — inside a 'finish' session the draft IS the value,
    // and syncing from the (deliberately stale) prop would erase the user's edit.
    if (!s.editing()) s.setDraft(formatValue(s.current(), s.precision()));
  });

  createEffect(() => {
    if (s.editing() && s.inputEl) {
      s.inputEl.focus();
      s.inputEl.select();
    }
  });

  // ── Wheel handling ───────────────────────────────────────────────────
  const onWheel = (e: WheelEvent): void => {
    if (props.disabled) return;
    // Read at wheel time, not stored: a stored flag goes stale when the panel unmounts with focus inside.
    if (props.requireFocus && !s.insideWidget(document.activeElement)) return;
    // deltaY is three-valued: 0 is a horizontal swipe or shift+wheel, not a request to step down.
    if (e.deltaY === 0) return;
    const direction = (props.invertScroll ?? false) ? -1 : 1;
    const dir: 1 | -1 = e.deltaY < 0 ? direction : direction === 1 ? -1 : 1;
    // Claim the gesture only if it MOVES the value: a picker at a bound must not publish
    // duplicates or swallow its container's scroll.
    const next = resolveMove(dir);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    s.setDraft(formatValue(next, s.precision()));
    s.emit(next);
  };

  createEffect(() => {
    if (props.disableWheel) return;
    const el = s.rootEl();
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', onWheel));
  });

  // The panel is PORTALLED, so it is not inside `rootEl` and the listener above misses
    // it. Without this, scrolling over the buttons just expanded would do nothing.
  createEffect(() => {
    if (props.disableWheel) return;
    if (!s.isOpen() || !s.collapsible()) return;
    const el = s.panelEl;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', onWheel));
  });

  // ── Commit draft ─────────────────────────────────────────────────────
  /**
   * Parse the typed text into the value. `exitEditing` is false when focus moved to a +/-
   * button inside the pop-out: take the text, but leave the editor open.
   */
  const commitDraft = (exitEditing = true): void => {
    // READ THE DRAFT FIRST: `setEditing(false)` re-arms the sync effect, which overwrites
        // the draft with the current value. That ordering shipped in 0.1.0 and silently
        // reverted typed input.
    const parsed = parseValue(s.draft(), s.precision());
    if (exitEditing) s.setEditing(false);
    if (parsed === null) {
      s.setDraft(formatValue(s.current(), s.precision()));
      return;
    }
    // Shared direct-set resolution (clamp + excludeZero-0 handling) — the same
    // rule a segment's `setValue` and the reset segment go through.
    const clamped = s.resolveSet(parsed);
    s.setDraft(formatValue(clamped, s.precision()));
    if (clamped !== s.current()) s.emit(clamped);
  };

  /** Where `steps` steps in `dir` land, or null if nowhere new. The ONE movement rule for
   *  clicks, holds, keys and the wheel (excludeZero skip, bounds, no-op guard). */
  const resolveMove = (dir: 1 | -1, steps = 1): number | null => {
    const next = s.resolveStep(s.current() + s.step() * steps * dir, dir);
    return next === s.current() ? null : next;
  };
  /** Take that move. Returns whether the value actually moved. */
  const stepBy = (dir: 1 | -1, steps = 1): boolean => {
    const next = resolveMove(dir, steps);
    if (next === null) return false;
    s.emit(next);
    return true;
  };

  // ── Auto-repeat ──────────────────────────────────────────────────────
  const autoRepeatDelay = (): number => props.autoRepeatDelay ?? 400;
  const autoRepeatInterval = (): number => props.autoRepeatInterval ?? 60;
  const autoRepeatAcceleration = (): boolean => props.autoRepeatAcceleration ?? false;

  const {
    start: startRepeat,
    stop: stopRepeat,
    onClick: onStepperClick,
  } = createAutoRepeat({
    step: stepBy,
    disabled: () => !!props.disabled,
    delay: autoRepeatDelay,
    interval: autoRepeatInterval,
    acceleration: autoRepeatAcceleration,
  });

  // ── Keyboard (spinbutton a11y) ───────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent): void => {
    if (props.disabled) return;
    const dir: 1 | -1 | null =
      e.key === 'ArrowUp' || e.key === 'PageUp' ? 1
        : e.key === 'ArrowDown' || e.key === 'PageDown' ? -1
          : null;
    if (dir !== null) {
      e.preventDefault();
      stepBy(dir, e.key.startsWith('Page') ? PAGE_STEPS : 1);
      return;
    }
    let next: number | null = null;
    // Home/End jump TO a bound; under excludeZero a 0 bound resolves one step
    // INWARD (the only legal direction from a bound).
    if (e.key === 'Home') next = s.resolveStep(s.min(), 1);
    else if (e.key === 'End') next = s.resolveStep(s.max(), -1);
    if (next !== null) {
      e.preventDefault();
      if (next !== s.current()) s.emit(next);
    }
  };

  return { place, commitDraft, stepBy, startRepeat, stopRepeat, onStepperClick, onKeyDown, popout };
}
