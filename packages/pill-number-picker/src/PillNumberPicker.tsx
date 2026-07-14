import { createSignal, createEffect, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  effectivePrecision,
  clampAndRound,
  parseValue,
  formatValue,
} from './_internal/precision';
import { autoValueWidthPx } from './_internal/layout';
import {
  resolvePopoutPosition,
  POPOUT_DEFAULT_GAP_PX,
  type PopoutPosition,
} from './_internal/popout';

export type PnpLayout =
  | 'value-inc-dec'
  | 'value-dec-inc'
  | 'inc-value-dec'
  | 'dec-value-inc'
  | 'inc-dec-value'
  | 'dec-inc-value'
  | 'v-inc-value-dec'
  | 'v-dec-value-inc';

export interface PillNumberPickerProps {
  value: number;
  onChange: (v: number) => void;

  // Range:
  min?: number;
  max?: number;
  step?: number;
  /**
   * Decimal places for parsing, step rounding, and display formatting.
   *
   * Defaults to the number of decimal places in `step` (so `step={0.5}`
   * gives precision 1 automatically). Set explicitly to override — e.g.
   * `step={1}, precision={2}` for integer steps with two-decimal display
   * (always shows '5.00', never '5'). Set to 0 to force integer mode
   * regardless of step.
   */
  precision?: number;

  // Sizing (preset + raw overrides):
  size?: 'xs' | 'sm' | 'md';
  width?: number | string;
  height?: number | string;
  buttonWidth?: number | string;
  fontSize?: number | string;

  // Layout (8 presets; default 'value-inc-dec'):
  layout?: PnpLayout;

  /**
   * COLLAPSE — at rest, render the value ALONE; reveal the +/- on demand.
   *
   * The picker's chrome is ~2/3 of its width, and in a dense row (a table cell, an
   * order leg, a rail) that chrome is paid for on every row while being used on
   * almost none of them. Collapsed, the control is just the number; activating it
   * expands the full picker into a pop-out layer ABOVE the surrounding content.
   *
   * The pop-out is rendered through a `<Portal>` and positioned in viewport
   * coordinates. That is not a stylistic choice: a picker in a row inside anything
   * with `overflow: hidden` / `overflow-y: auto` — which is most dense layouts —
   * would have an in-flow expansion CLIPPED by its own ancestor.
   *
   * The value cell keeps `fit-content` sizing while collapsed, so the number is
   * never truncated no matter how many digits it grows to.
   *
   * Off by default; every existing call site renders exactly as before.
   */
  collapsible?: boolean;
  /**
   * Controlled open state. Omit for uncontrolled (the component owns it).
   * Pair with `onOpenChange` to drive it yourself.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Gap in px between the collapsed value and the pop-out panel. Default 4. */
  popoutGap?: number;

  /**
   * WHEN the value is published — the editing session's commit policy.
   *
   *   'change'  (default, and what every existing call site already gets)
   *             Every step publishes immediately via `onChange`. The editing session
   *             still emits `onCommit` / `onCancel` so a consumer can tell a settled
   *             value from a value being scrubbed through.
   *
   *   'finish'  The pop-out steps a LOCAL DRAFT. The display updates, `onChange` stays
   *             SILENT, and the value is published only on commit. For a consumer where
   *             each intermediate value is expensive or destructive (a request per tick,
   *             an order repriced on every keystroke), 'change' is not merely noisy — it
   *             is wrong, and no amount of debouncing at the callsite fixes the fact
   *             that the component was reporting values the user never chose.
   *
   * COMMIT is: Enter in the editor, or clicking the collapsed pill again to close it.
   * CANCEL is: Escape, or a pointerdown outside the pop-out.
   *
   * Applies to the EDITING SESSION only. Stepping the collapsed pill with the wheel or
   * the arrow keys opens no session and therefore publishes immediately in both modes —
   * there is nothing to confirm, and requiring a confirmation for a scroll gesture would
   * be a tax on the fastest path the control has.
   */
  commit?: 'change' | 'finish';
  /** The value was CONFIRMED — Enter, or clicking the pill to close the editor. */
  onCommit?: (value: number) => void;
  /** The session was ABANDONED — Escape, or an outside pointerdown. Receives the value
   *  the picker is left holding (the pre-session value, unless `revertOnCancel={false}`). */
  onCancel?: (value: number) => void;
  /**
   * Cancel restores the value the session started with. Default true.
   *
   * In 'finish' mode this is free — the draft is simply discarded. In 'change' mode the
   * consumer has ALREADY seen the intermediate values, so the revert is an explicit
   * `onChange(valueAtOpen)`; without it, "cancel" would mean two different things
   * depending on the commit mode, which is worse than either meaning alone.
   */
  revertOnCancel?: boolean;

  // Display:
  /**
   * Click-to-type on the value cell. Default true.
   *
   * Interaction with `collapsible`: a COLLAPSED picker's value cell click EXPANDS it
   * — it does not enter edit mode. Editing is then a click on the value inside the
   * pop-out. The two cannot share the first click, and expanding is the one the user
   * is more often after (they can already step with the wheel and the arrow keys
   * without expanding at all).
   */
  editable?: boolean;
  suffix?: string;
  zeroLabel?: string;
  displayValue?: (v: number) => string;

  // Icons:
  incrementIcon?: JSX.Element;
  decrementIcon?: JSX.Element;

  // Min/max display:
  showRange?: boolean;
  rangeFormat?: (value: number, min: number, max: number) => string;

  // Wheel:
  invertScroll?: boolean;
  disableWheel?: boolean;
  requireFocus?: boolean;

  // Auto-repeat:
  autoRepeatDelay?: number;
  autoRepeatInterval?: number;
  autoRepeatAcceleration?: boolean;

  // A11y:
  ariaLabel?: string;
  incrementLabel?: string;
  decrementLabel?: string;
  disabled?: boolean;

  // Passthrough:
  class?: string;
}

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export function PillNumberPicker(props: PillNumberPickerProps): JSX.Element {
  // ── Props with defaults ──────────────────────────────────────────────
  const min = (): number => props.min ?? 1;
  const max = (): number => props.max ?? 100;
  const step = (): number => props.step ?? 1;
  const size = (): 'xs' | 'sm' | 'md' => props.size ?? 'md';
  const layout = (): PnpLayout => props.layout ?? 'value-inc-dec';
  const editable = (): boolean => (props.editable ?? true) && !props.disabled;
  // Decimal precision — explicit prop overrides; otherwise infer from step.
  // 0 in either signal means integer mode (current/default behavior).
  const precision = (): number => effectivePrecision(step(), props.precision);

  // Auto-width sized to the widest formatted number (min or max), accounting
  // for precision so '2.50' isn't undercounted vs raw '2.5'.
  const valueWidth = (): string =>
    toCssSize(props.width) ?? `${autoValueWidthPx(max(), min(), precision())}px`;

  // Clamp to [min, max] then round to precision — applied to every place that
  // produces a new value (inc, dec, wheel, keyboard, edit-commit, auto-repeat)
  // so FP drift from accumulated step arithmetic never leaks into props.value.
  const clamp = (v: number): number => clampAndRound(v, min(), max(), precision());

  // ── Local editing state ──────────────────────────────────────────────
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(String(props.value));
  const [focused, setFocused] = createSignal(false);
  let inputEl: HTMLInputElement | undefined;
  let rootEl: HTMLDivElement | undefined;

  // ── Collapse / pop-out state ─────────────────────────────────────────
  const collapsible = (): boolean => props.collapsible ?? false;
  const [openUncontrolled, setOpenUncontrolled] = createSignal(false);
  // Controlled when `open` is supplied; uncontrolled otherwise. `onOpenChange`
  // fires either way, so a controlled parent stays authoritative and an
  // uncontrolled one can still observe.
  const isOpen = (): boolean =>
    !collapsible() ? true : (props.open ?? openUncontrolled());
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setOpenUncontrolled(next);
    props.onOpenChange?.(next);
    // Leaving the pop-out must not strand a half-typed draft in edit mode.
    if (!next) setEditing(false);
  };
  /** True only while the picker is collapsed AND shut — the resting state. */
  const isCollapsed = (): boolean => collapsible() && !isOpen();
  /** True while an EDITING SESSION is live: the pop-out is open and awaiting a commit or
   *  a cancel. A non-collapsible picker never has one — it is always just publishing. */
  const sessionOpen = (): boolean => collapsible() && isOpen();

  // ── The editing SESSION (commit / cancel) ────────────────────────────
  const commitMode = (): 'change' | 'finish' => props.commit ?? 'change';
  /**
   * The uncommitted value, live only while a 'finish'-mode session is open.
   *
   * `null` means "no session" — outside a session the component is exactly as
   * controlled as it always was, and `props.value` is the single source of truth. A
   * session makes it TEMPORARILY semi-uncontrolled on purpose: that is the whole point
   * of deferring the publish.
   */
  const [session, setSession] = createSignal<number | null>(null);
  /** The value the session began with — what a cancel restores. */
  let valueAtOpen: number | null = null;

  /** What the control DISPLAYS and steps from: the draft if a session owns it, else the
   *  controlled prop. Every read of the current value goes through here. */
  const current = (): number => session() ?? props.value;

  /**
   * Publish a new value.
   *
   * In a 'finish' session this writes the draft and stays silent. Otherwise it is the
   * plain controlled `onChange` the component has always had.
   */
  const emit = (next: number): void => {
    // The draft is synced on EVERY publish, not just inside a session. While the editor is
    // open the draft IS what the input displays, and the "resync when not editing" effect
    // is by definition dormant — so a +/- press during an open edit would otherwise leave
    // the input showing a stale number, and the next Enter would parse that stale text and
    // shove the value BACK to it. Stepping and typing have to agree on one draft.
    setDraft(formatValue(next, precision()));
    if (session() !== null) {
      setSession(next);
      return;
    }
    props.onChange(next);
  };

  const beginSession = (): void => {
    valueAtOpen = props.value;
    if (commitMode() === 'finish') setSession(props.value);
    setDraft(formatValue(props.value, precision()));
  };

  /** Open the editor: the pop-out, with the value cell already in edit mode. */
  const openEditor = (): void => {
    if (props.disabled) return;
    beginSession();
    setOpen(true);
    if (editable()) setEditing(true);
  };

  /**
   * CONFIRM — Enter, or clicking the collapsed pill again to close it.
   *
   * A 'finish' session publishes its draft here, and ONLY here. `onCommit` fires in both
   * modes: in 'change' mode the value was already flowing, but "the user settled on this"
   * is a different fact from "the value moved", and a consumer that treats a scrub as a
   * decision (firing a request, sending an order) needs to be able to tell them apart.
   */
  const commitSession = (): void => {
    const pending = session();
    if (pending !== null && pending !== props.value) props.onChange(pending);
    const settled = pending ?? props.value;
    setSession(null);
    valueAtOpen = null;
    setOpen(false);
    props.onCommit?.(settled);
  };

  /**
   * CANCEL — Escape, or a pointerdown outside the pop-out.
   *
   * With `revertOnCancel` (the default) the session's value is undone. In 'finish' mode
   * that is free: the draft is dropped and nothing was ever published. In 'change' mode
   * the consumer HAS seen the intermediate values, so the revert must be published as a
   * real `onChange(valueAtOpen)` — otherwise "cancel" would mean "undo" in one mode and
   * "keep" in the other, and no consumer could reason about it.
   */
  const cancelSession = (): void => {
    const startedAt = valueAtOpen;
    const revert = props.revertOnCancel ?? true;
    const pending = session();
    setSession(null);
    valueAtOpen = null;
    setOpen(false);

    let restored = pending ?? props.value;
    if (revert && startedAt !== null) {
      restored = startedAt;
      // Publish the revert only when the consumer actually SAW a different value — i.e.
      // 'change' mode, where the intermediate steps were published. In 'finish' mode
      // props.value never moved, so this is a no-op and must stay one: a cancel that
      // changed nothing must not churn the consumer with a spurious onChange.
      if (props.value !== startedAt) props.onChange(startedAt);
    }
    setDraft(formatValue(restored, precision()));
    props.onCancel?.(restored);
  };

  const [popout, setPopout] = createSignal<PopoutPosition | null>(null);
  let anchorEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  /**
   * Measure and place the panel.
   *
   * Runs after the panel is in the DOM (its size is not knowable before), and again
   * on scroll and resize: the panel is `position: fixed`, so ANY scroll of ANY
   * ancestor moves the anchor out from under it. `scroll` is captured (third arg
   * `true`) precisely because the scrolling ancestor is usually not `window` — it is
   * the consumer's own scroll container, and a bubbling listener would never hear it.
   */
  const place = (): void => {
    if (!anchorEl || !panelEl) return;
    const a = anchorEl.getBoundingClientRect();
    const p = panelEl.getBoundingClientRect();
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
   * Dismissal + repositioning, live only while the pop-out is open.
   *
   * Outside-press closes on `pointerdown` rather than `click`: a click fires after
   * the press completes, so a user pressing a control in a neighbouring row would
   * otherwise interact with a panel that is still on top of it.
   */
  createEffect(() => {
    if (!isOpen() || !collapsible()) {
      setPopout(null);
      return;
    }
    place();

    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (panelEl?.contains(t)) return;
      if (anchorEl?.contains(t)) return; // the anchor's own click toggles; don't double-handle
      // Clicking away is an ABANDONED edit, not a silent acceptance of whatever the value
      // happened to be mid-scrub.
      cancelSession();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancelSession();
        // Return focus to where the user was, or the close is a dead end for the keyboard.
        (anchorEl?.querySelector('[data-pos="value"]') as HTMLElement | null)?.focus();
      }
    };
    const onReflow = (): void => place();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    // Capture: the scroll that moves us is almost never on `window`.
    window.addEventListener('scroll', onReflow, true);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    });
  });

  createEffect(() => {
    // `current()`, not `props.value` — inside a 'finish' session the draft IS the value,
    // and syncing from the (deliberately stale) prop would erase the user's edit.
    if (!editing()) setDraft(formatValue(current(), precision()));
  });

  createEffect(() => {
    if (editing() && inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  });

  // ── Wheel handling ───────────────────────────────────────────────────
  const onWheel = (e: WheelEvent): void => {
    if (props.disabled) return;
    if (props.requireFocus && !focused()) return;
    const direction = (props.invertScroll ?? false) ? -1 : 1;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? step() * direction : -step() * direction;
    const next = clamp(current() + delta);
    setDraft(formatValue(next, precision()));
    emit(next);
  };

  createEffect(() => {
    if (props.disableWheel) return;
    const el = rootEl;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', onWheel));
  });

  // The pop-out panel is PORTALLED — it is not inside `rootEl`, so the listener above
  // does not cover it. Without this, scrolling over the very buttons the user just
  // expanded would do nothing (or worse, scroll the page behind them).
  createEffect(() => {
    if (props.disableWheel) return;
    if (!isOpen() || !collapsible()) return;
    const el = panelEl;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', onWheel));
  });

  // ── Commit draft ─────────────────────────────────────────────────────
  /**
   * Parse the typed text into the value.
   *
   * `exitEditing` is false when focus merely moved to a +/- button INSIDE the open
   * pop-out: the typed text should be taken, but the editor must stay open — otherwise
   * reaching for `+` would silently close the text field the user was typing in.
   */
  const commitDraft = (exitEditing = true): void => {
    // READ THE DRAFT FIRST. `setEditing(false)` re-arms the sync effect below
    // (`if (!editing()) setDraft(formatValue(current()))`), which overwrites the draft
    // with the CURRENT value — so exiting edit mode before parsing throws away exactly
    // the text the user just typed. That ordering was the shipped 0.1.0 behaviour and it
    // meant typing a number and pressing Enter silently reverted it; the package had no
    // DOM tests, so nothing caught it. `typed text is published on Enter` now does.
    const parsed = parseValue(draft(), precision());
    if (exitEditing) setEditing(false);
    if (parsed === null) {
      setDraft(formatValue(current(), precision()));
      return;
    }
    const clamped = clamp(parsed);
    setDraft(formatValue(clamped, precision()));
    if (clamped !== current()) emit(clamped);
  };

  // ── Auto-repeat ──────────────────────────────────────────────────────
  const autoRepeatDelay = (): number => props.autoRepeatDelay ?? 400;
  const autoRepeatInterval = (): number => props.autoRepeatInterval ?? 60;
  const autoRepeatAcceleration = (): boolean => props.autoRepeatAcceleration ?? false;

  let repeatTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatInterval: ReturnType<typeof setTimeout> | undefined;
  let holdStart: number | null = null;

  const stopRepeat = (): void => {
    if (repeatTimer !== undefined) { clearTimeout(repeatTimer); repeatTimer = undefined; }
    if (repeatInterval !== undefined) { clearTimeout(repeatInterval); repeatInterval = undefined; }
    holdStart = null;
  };

  const startRepeat = (direction: 1 | -1): void => {
    stopRepeat();
    if (props.disabled) return;
    holdStart = Date.now();

    const doStep = (): void => {
      const next = clamp(current() + step() * direction);
      if (next === current()) { stopRepeat(); return; }
      emit(next);
    };

    repeatTimer = setTimeout(() => {
      const scheduleNext = (): void => {
        doStep();
        let interval = autoRepeatInterval();
        if (autoRepeatAcceleration() && holdStart !== null) {
          const heldMs = Date.now() - holdStart;
          // Halve interval every 1.5s held; floor at 15ms.
          const factor = Math.pow(0.5, Math.floor(heldMs / 1500));
          interval = Math.max(15, Math.floor(autoRepeatInterval() * factor));
        }
        repeatInterval = setTimeout(scheduleNext, interval);
      };
      scheduleNext();
    }, autoRepeatDelay());
  };

  onCleanup(stopRepeat);

  // ── Keyboard (spinbutton a11y) ───────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent): void => {
    if (props.disabled) return;
    let next: number | null = null;
    if (e.key === 'ArrowUp') next = clamp(current() + step());
    else if (e.key === 'ArrowDown') next = clamp(current() - step());
    else if (e.key === 'PageUp') next = clamp(current() + step() * 10);
    else if (e.key === 'PageDown') next = clamp(current() - step() * 10);
    else if (e.key === 'Home') next = min();
    else if (e.key === 'End') next = max();
    if (next !== null) {
      e.preventDefault();
      if (next !== current()) emit(next);
    }
  };

  // ── Element builders ─────────────────────────────────────────────────
  const incButton = (): JSX.Element => (
    <button
      type="button"
      data-pos="inc"
      class="cpnp-btn"
      style={{
        width: toCssSize(props.buttonWidth),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
      }}
      disabled={props.disabled || current() >= max()}
      aria-label={props.incrementLabel ?? 'Increase'}
      onClick={() => {
        if (props.disabled) return;
        emit(clamp(current() + step()));
      }}
      onPointerDown={() => startRepeat(1)}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
    >
      {props.incrementIcon ?? '+'}
    </button>
  );

  const decButton = (): JSX.Element => (
    <button
      type="button"
      data-pos="dec"
      class="cpnp-btn"
      style={{
        width: toCssSize(props.buttonWidth),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
      }}
      disabled={props.disabled || current() <= min()}
      aria-label={props.decrementLabel ?? 'Decrease'}
      onClick={() => {
        if (props.disabled) return;
        emit(clamp(current() - step()));
      }}
      onPointerDown={() => startRepeat(-1)}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
    >
      {props.decrementIcon ?? '−'}
    </button>
  );

  const valueText = (): string =>
    current() === 0 && props.zeroLabel
      ? props.zeroLabel
      : (props.displayValue ? props.displayValue(current()) : formatValue(current(), precision()));

  /**
   * The value cell.
   *
   * `where` matters because a collapsed picker's value cell is a DIFFERENT control
   * from the one inside the pop-out:
   *   'collapsed' — the resting anchor. Its click OPENS THE EDITOR; clicking it again
   *                 CLOSES and CONFIRMS. Arrow keys and the wheel still step it in place,
   *                 so the common case never has to open anything.
   *   'panel'     — the live control inside the pop-out. Opening focuses and selects it,
   *                 so the editor is ready to type into. Enter confirms.
   */
  const valueNode = (where: 'panel' | 'collapsed'): JSX.Element => {
    const collapsedCell = where === 'collapsed';
    const commonStyle = (): JSX.CSSProperties => ({
      // Collapsed, the cell hugs its digits: `valueWidth()` becomes a FLOOR rather
      // than a fixed width, so a value that outgrows the reserved width widens the
      // pill instead of being clipped by it. That is the whole point of the resting
      // state — the number must always be fully legible.
      width: collapsedCell ? 'max-content' : valueWidth(),
      'min-width': collapsedCell ? valueWidth() : undefined,
      height: toCssSize(props.height),
      'font-size': toCssSize(props.fontSize),
    });
    return (
      <Show
        when={editing() && editable() && !collapsedCell}
        fallback={
          <span
            data-pos="value"
            class="cpnp-value"
            role="spinbutton"
            tabIndex={props.disabled ? -1 : 0}
            aria-valuenow={current()}
            aria-valuemin={min()}
            aria-valuemax={max()}
            aria-label={props.ariaLabel}
            aria-expanded={collapsible() && collapsedCell ? false : undefined}
            style={{
              ...commonStyle(),
              cursor: collapsedCell ? 'pointer' : editable() ? 'text' : 'default',
            }}
            onClick={() => {
              if (props.disabled) return;
              if (collapsedCell) { openEditor(); return; }
              if (editable()) setEditing(true);
            }}
            onKeyDown={(e) => {
              // Enter / Space open the editor from the keyboard — without this the
              // pop-out is mouse-only for a collapsed picker.
              if (collapsedCell && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                openEditor();
                return;
              }
              onKeyDown(e);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            {valueText()}
          </span>
        }
      >
        <input
          ref={inputEl}
          data-pos="value"
          class="cpnp-input"
          type="text"
          inputMode="numeric"
          value={draft()}
          style={commonStyle()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={(e) => {
            // Focus moving to a +/- button in the SAME pop-out is not the end of the
            // edit — take the typed text, but leave the editor open. Closing it here
            // would mean reaching for `+` silently dismissed the field you were typing in.
            const next = e.relatedTarget as Node | null;
            const stayingInPanel = !!next && !!panelEl && panelEl.contains(next);
            commitDraft(!stayingInPanel);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Take the text, then END the session: close and confirm. This is the
              // primary confirmation gesture.
              commitDraft();
              if (sessionOpen()) commitSession();
            } else if (e.key === 'Escape') {
              if (sessionOpen()) {
                cancelSession();
              } else {
                setEditing(false);
                setDraft(formatValue(current(), precision()));
              }
            } else {
              onKeyDown(e);
            }
          }}
        />
      </Show>
    );
  };

  /**
   * The anchor while the editor is open.
   *
   * It holds the row's LAYOUT (so opening never reflows the host) and it is the CLOSE
   * gesture: clicking the pill again confirms and closes, which is the symmetric partner
   * of the click that opened it. It is NOT the live control — the panel is — so it is
   * `aria-hidden`: a screen reader offered the same spinbutton twice would have no way to
   * tell which one it was on. Keyboard users close with Enter or Escape from the panel,
   * so nothing is lost by hiding a mouse-only affordance from them.
   */
  const anchorPlaceholder = (): JSX.Element => (
    <span
      class="cpnp-value"
      aria-hidden="true"
      data-placeholder="true"
      title="Confirm"
      style={{
        width: 'max-content',
        'min-width': valueWidth(),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
        cursor: 'pointer',
      }}
      onClick={() => {
        if (props.disabled) return;
        commitSession();
      }}
    >
      {valueText()}
    </span>
  );

  // ── Layout assembly ──────────────────────────────────────────────────
  const items = (): JSX.Element[] => {
    const parts = layout().replace(/^v-/, '').split('-') as Array<'value' | 'inc' | 'dec'>;
    return parts.map((p) => {
      if (p === 'value') return valueNode('panel');
      if (p === 'inc') return incButton();
      return decButton();
    });
  };

  const rangeText = (): string => {
    const fmt = props.rangeFormat ?? ((v: number, _min: number, mx: number) => `${v} / ${mx}`);
    return fmt(props.value, min(), max());
  };

  const suffixNode = (): JSX.Element => (
    <>
      <Show when={props.suffix && !(props.value === 0 && props.zeroLabel)}>
        <span class="cpnp-suffix">{props.suffix}</span>
      </Show>
      <Show when={props.showRange}>
        <span class="cpnp-range">{rangeText()}</span>
      </Show>
    </>
  );

  // Re-place once the panel has actually been laid out. The first `place()` inside the
  // open-effect runs before the browser has sized the portalled panel, so its measured
  // height can be 0 — which would resolve the placement against a phantom.
  const PanelBody = (): JSX.Element => {
    onMount(() => place());
    return (
      <div class="cpnp-items" data-layout={layout()}>
        {items()}
      </div>
    );
  };

  return (
    <Show
      when={collapsible()}
      fallback={
        <div
          ref={rootEl}
          class={`cpnp-root cpnp-size-${size()} ${props.class ?? ''}`.trim()}
          role="group"
          aria-label={props.ariaLabel}
          aria-disabled={props.disabled ? true : undefined}
        >
          {/* Items live in their own flex subcontainer so :first-child /
              :last-child corner rounding works regardless of suffix/range. */}
          <div class="cpnp-items" data-layout={layout()}>
            {items()}
          </div>
          {suffixNode()}
        </div>
      }
    >
      <div
        ref={rootEl}
        class={`cpnp-root cpnp-size-${size()} ${props.class ?? ''}`.trim()}
        role="group"
        aria-label={props.ariaLabel}
        aria-disabled={props.disabled ? true : undefined}
        data-collapsible="true"
        data-open={isOpen() ? 'true' : undefined}
      >
        {/* The anchor stays in flow whether open or shut, so expanding NEVER reflows
            the row it lives in — the panel is a separate layer. */}
        <div ref={anchorEl} class="cpnp-items cpnp-anchor" data-layout={layout()}>
          {isCollapsed() ? valueNode('collapsed') : anchorPlaceholder()}
        </div>
        {suffixNode()}

        <Show when={isOpen()}>
          <Portal>
            <div
              ref={panelEl}
              class={`cpnp-root cpnp-size-${size()} cpnp-popout ${props.class ?? ''}`.trim()}
              role="group"
              aria-label={props.ariaLabel}
              data-placement={popout()?.placement}
              style={{
                position: 'fixed',
                top: `${popout()?.top ?? 0}px`,
                left: `${popout()?.left ?? 0}px`,
                // Until the first measurement lands, the panel would otherwise paint
                // at 0,0 for one frame — a flash in the top-left corner of the screen.
                visibility: popout() ? 'visible' : 'hidden',
              }}
            >
              <PanelBody />
            </div>
          </Portal>
        </Show>
      </div>
    </Show>
  );
}
