import { createSignal, createEffect, on, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createEscapeOwner } from '@cujuju/solidjs-hooks';
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

import type { PnpLayout, PnpSegmentApi, PnpSegment, PillNumberPickerProps } from './types';
import { createAutoRepeat } from './_internal/autoRepeat';

export type { PnpLayout, PnpSegmentApi, PnpSegment, PillNumberPickerProps } from './types';

/** PageUp/PageDown move ±step×10, as documented in the README (Keyboard). */
const PAGE_STEPS = 10;

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

  // Clamp then round, applied everywhere a new value is produced, so FP drift from
    // accumulated step arithmetic never leaks into props.value.
  const clamp = (v: number): number => clampAndRound(v, min(), max(), precision());

  const excludeZero = (): boolean => props.excludeZero ?? false;
  /** Resolve a candidate produced by MOVEMENT: clamp, then under `excludeZero` skip an exact-0
   *  landing by continuing one step. Bounds forcing it back make the move a no-op. */
  const resolveStep = (raw: number, dir: 1 | -1): number => {
    const next = clamp(raw);
    if (!excludeZero() || next !== 0) return next;
    const skipped = clamp(dir * step());
    return skipped === 0 ? current() : skipped;
  };
  /** Resolve a DIRECTLY SET value — typed text, `setValue`, reset. A set has no travel
   *  direction, so 0 reads as "minimum", not "flip". It can never emit an illegal 0. */
  const resolveSet = (raw: number): number => {
    const clamped = clamp(raw);
    if (!excludeZero() || clamped !== 0) return clamped;
    const side: 1 | -1 = current() >= 0 ? 1 : -1;
    const nearest = clamp(side * step());
    return nearest === 0 ? current() : nearest;
  };

  // ── Local editing state ──────────────────────────────────────────────
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(String(props.value));
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
    // Already there: report nothing. The session enders call this on a close the
    // CONSUMER initiated, and echoing its own `open` back at it is not a state change.
    if (isOpen() === next) {
      if (!next) setEditing(false);
      return;
    }
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
   * The uncommitted value, live only while a 'finish' session is open. `null` means no
   * session, and `props.value` is then the single source of truth.
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
    // Synced on EVERY publish: while the editor is open the draft IS what the input shows,
            // so a +/- press would otherwise leave stale text for Enter to parse.
    setDraft(formatValue(next, precision()));
    // `sessionOpen()` too: a draft that outlived its pop-out must not silence the resting pill's publishes.
    if (sessionOpen() && session() !== null) {
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

  /** Open the editor: the pop-out, with the value cell already in edit mode. Session and
   *  edit mode hang off the OPEN STATE (effect below), not this gesture. */
  const openEditor = (): void => {
    if (props.disabled) return;
    setOpen(true);
  };

  /**
   * Hand focus back to the collapsed value cell — only when focus is still ours or nobody's.
   * The <body> fallback applies to self-initiated closes; others pass `restoreFocus: false`.
   */
  const panelOwnsFocus = (): boolean => {
    const active = document.activeElement;
    return !active || active === document.body || insideWidget(active);
  };
  const restoreAnchorFocus = (): void => {
    (anchorEl?.querySelector('[data-pos="value"]') as HTMLElement | null)?.focus();
  };
  /** Decided when a close is requested; honoured on the close edge, once the collapsed cell exists. */
  let returnFocusOnClose = false;
  /** One-shot: set where a commit or a cancel DECIDES the close, cleared when the editor
   *  next opens. `valueAtOpen === null` cannot serve here — it outlives the close. */
  let closeDecided = false;
  /** Open the value cell for typing. A live editor means no close is in flight, so it re-arms. */
  const beginEditing = (): void => {
    closeDecided = false;
    setEditing(true);
  };

  /**
   * CONFIRM — Enter, or clicking the collapsed pill again. `onCommit` fires in both modes:
   * "the user settled on this" is a different fact from "the value moved".
   */
  const commitSession = (): void => {
    const pending = session();
    returnFocusOnClose = panelOwnsFocus();
    if (pending !== null && pending !== props.value) props.onChange(pending);
    const settled = pending ?? props.value;
    setSession(null);
    valueAtOpen = null;
    closeDecided = true;
    setOpen(false);
    props.onCommit?.(settled);
  };

  /**
   * CANCEL — Escape, or a pointerdown outside the pop-out. In 'change' mode the revert must
   * be published, or cancel would mean "undo" in one mode and "keep" in the other.
   */
  const cancelSession = (opts: { restoreFocus?: boolean } = {}): void => {
    const startedAt = valueAtOpen;
    returnFocusOnClose = opts.restoreFocus ?? panelOwnsFocus();
    const revert = props.revertOnCancel ?? true;
    const pending = session();
    setSession(null);
    valueAtOpen = null;
    closeDecided = true;
    setOpen(false);

    let restored = pending ?? props.value;
    if (revert && startedAt !== null) {
      restored = startedAt;
      // Publish the revert only when the consumer actually SAW a different value. In 'finish'
            // mode props.value never moved, so a spurious onChange would churn the consumer.
      if (props.value !== startedAt) props.onChange(startedAt);
    }
    setDraft(formatValue(restored, precision()));
    props.onCancel?.(restored);
  };

  /**
   * THE SESSION'S LIFETIME IS THE OPEN STATE: controlled `open` can change with no gesture,
   * so {closed, session live} must be unrepresentable. A close edge the picker didn't initiate CANCELS.
   */
  createEffect(
    on(sessionOpen, (nowOpen, wasOpen = false) => {
      if (nowOpen === wasOpen) return;
      if (nowOpen) {
        returnFocusOnClose = false;
        beginSession();
        if (editable()) beginEditing();
        return;
      }
      // Still live here means the CONSUMER closed it: no evidence the user was on this pill.
      if (valueAtOpen !== null) cancelSession({ restoreFocus: false });
      // Re-checked here: focus may have moved on while a consumer took its time lowering `open`.
      if (returnFocusOnClose && panelOwnsFocus()) restoreAnchorFocus();
      returnFocusOnClose = false;
    }),
  );

  const [popout, setPopout] = createSignal<PopoutPosition | null>(null);
  let anchorEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  /** Part of this widget: the in-flow root OR the portalled panel, which is not inside it. */
  const insideWidget = (node: Node | null): boolean =>
    !!node && (!!rootEl?.contains(node) || !!panelEl?.contains(node));
  /** Focus left the widget for a real target, so a pending close must not pull it back. */
  const onWidgetFocusOut = (e: FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    if (next && !insideWidget(next)) returnFocusOnClose = false;
  };

  /**
   * Measure and place the panel. Re-runs on scroll and resize because the panel is
   * `position: fixed`; `scroll` is CAPTURED, since the scrolling ancestor is rarely `window`.
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
   * Dismissal + repositioning, live only while the pop-out is open. Outside-press closes on
   * `pointerdown`, not `click`, which fires too late to stop a neighbouring control.
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
      // Clicking away is an ABANDONED edit, not silent acceptance. Never restore focus: at
            // pointerdown the browser has not yet moved it to what was pressed.
      cancelSession({ restoreFocus: false });
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

  /*
   * Which open pop-out owns the keyboard: last opened wins. `createEscapeOwner` holds that stack on
   * `globalThis` for the whole toolkit, so one Escape never cancels two surfaces.
   */
  /**
   * Escape CANCELS the session — but only while this pop-out is the topmost open surface. The
   * owner is released on close and on unmount, so every path out pops it.
   */
  createEscapeOwner({
    open: sessionOpen,
    // Return focus to where the user was, or the close is a dead end for the keyboard.
    onDismiss: () => cancelSession({ restoreFocus: true }),
    // The value editor inside the pop-out handles its own Escape first.
    owns: () => [panelEl],
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
    // Read at wheel time, not stored: a stored flag goes stale when the panel unmounts with focus inside.
    if (props.requireFocus && !insideWidget(document.activeElement)) return;
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

  // The panel is PORTALLED, so it is not inside `rootEl` and the listener above misses
    // it. Without this, scrolling over the buttons just expanded would do nothing.
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
   * Parse the typed text into the value. `exitEditing` is false when focus moved to a +/-
   * button inside the pop-out: take the text, but leave the editor open.
   */
  const commitDraft = (exitEditing = true): void => {
    // READ THE DRAFT FIRST: `setEditing(false)` re-arms the sync effect, which overwrites
        // the draft with the current value. That ordering shipped in 0.1.0 and silently
        // reverted typed input.
    const parsed = parseValue(draft(), precision());
    if (exitEditing) setEditing(false);
    if (parsed === null) {
      setDraft(formatValue(current(), precision()));
      return;
    }
    // Shared direct-set resolution (clamp + excludeZero-0 handling) — the same
    // rule a segment's `setValue` and the reset segment go through.
    const clamped = resolveSet(parsed);
    setDraft(formatValue(clamped, precision()));
    if (clamped !== current()) emit(clamped);
  };

  /** Where `steps` steps in `dir` land, or null if nowhere new. The ONE movement rule for
   *  clicks, holds, keys and the wheel (excludeZero skip, bounds, no-op guard). */
  const resolveMove = (dir: 1 | -1, steps = 1): number | null => {
    const next = resolveStep(current() + step() * steps * dir, dir);
    return next === current() ? null : next;
  };
  /** Take that move. Returns whether the value actually moved. */
  const stepBy = (dir: 1 | -1, steps = 1): boolean => {
    const next = resolveMove(dir, steps);
    if (next === null) return false;
    emit(next);
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
    if (e.key === 'Home') next = resolveStep(min(), 1);
    else if (e.key === 'End') next = resolveStep(max(), -1);
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
      onClick={onStepperClick(1)}
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
      onClick={onStepperClick(-1)}
      onPointerDown={() => startRepeat(-1)}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
    >
      {props.decrementIcon ?? '−'}
    </button>
  );

  /** The reset target, clamped/rounded like any other publish, so `resetTo`
   *  outside [min,max] (or off-grid for the precision) still lands legal. */
  const resetTarget = (): number => clamp(props.resetTo ?? 0);

  /**
   * The channel a segment's `onSelect` gets, built fresh per click so `value` is an honest
   * snapshot. `setValue` goes through the SAME paths a step does.
   */
  const segmentApi = (): PnpSegmentApi => ({
    value: current(),
    setValue: (v: number): void => {
      const next = resolveSet(v);
      if (next !== current()) emit(next);
    },
    commit: (): void => {
      if (sessionOpen()) commitSession();
    },
    cancel: (): void => {
      if (sessionOpen()) cancelSession();
    },
  });

  /** ONE render path for every segment — built-in reset and consumer-declared
   *  alike — so flush borders, sizing, disabled treatment and the publish
   *  channel can never diverge between them. */
  const segmentButton = (seg: PnpSegment): JSX.Element => (
    <button
      type="button"
      data-pos={`seg-${seg.key}`}
      class="cpnp-btn"
      style={{
        width: toCssSize(seg.width ?? props.buttonWidth),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
      }}
      disabled={props.disabled || (seg.disabled?.(current()) ?? false)}
      aria-label={seg.label}
      onClick={() => {
        if (props.disabled) return;
        seg.onSelect(segmentApi());
      }}
    >
      {seg.icon}
    </button>
  );

  /** `resetTo` is sugar over the segment contract — proof the generic API
   *  subsumes the built-in, and the reason there is only one render path. */
  const resetSegment = (): PnpSegment => ({
    key: 'reset',
    icon: props.resetIcon ?? '↺',
    label: props.resetLabel ?? 'Reset',
    disabled: (v) => v === resetTarget(),
    onSelect: (api) => api.setValue(resetTarget()),
  });

  const valueText = (): string =>
    current() === 0 && props.zeroLabel
      ? props.zeroLabel
      : (props.displayValue ? props.displayValue(current()) : formatValue(current(), precision()));

  /**
   * The value cell. `where` matters because a collapsed picker's cell is a DIFFERENT control
   * from the one inside the pop-out: it opens the editor rather than being it.
   */
  const valueNode = (where: 'panel' | 'collapsed'): JSX.Element => {
    const collapsedCell = where === 'collapsed';
    const commonStyle = (): JSX.CSSProperties => ({
      // Collapsed, the cell hugs its digits: `valueWidth()` becomes a FLOOR, so a value that
            // outgrows it widens the pill instead of being clipped.
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
              if (editable()) beginEditing();
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
            // Focus moving to a +/- button in the SAME pop-out is not the end of the edit: take the
                        // typed text, but leave the editor open.
            const next = e.relatedTarget as Node | null;
            const stayingInPanel = !!next && !!panelEl && panelEl.contains(next);
            // Chromium blurs a focused input as it is removed. Once a close has decided the session
            // (collapsed shut, or a close in flight), typed text must not publish.
            if (isCollapsed() || (collapsible() && closeDecided)) return;
            commitDraft(!stayingInPanel);
          }}
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
   * The anchor while the editor is open. It holds the row's LAYOUT and is the CLOSE gesture,
   * but is `aria-hidden`: the same spinbutton offered twice is indistinguishable.
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
    const segs = props.segments ?? [];
    const parts = layout().replace(/^v-/, '').split('-') as Array<'value' | 'inc' | 'dec'>;
    // Row order: [start segments][layout parts][end segments][reset]. Every member picks up
        // the positional flush-border and outer-corner rules.
    const out: JSX.Element[] = segs
      .filter((s) => s.position === 'start')
      .map(segmentButton);
    for (const p of parts) {
      if (p === 'value') out.push(valueNode('panel'));
      else if (p === 'inc') out.push(incButton());
      else out.push(decButton());
    }
    out.push(...segs.filter((s) => (s.position ?? 'end') === 'end').map(segmentButton));
    // Reset stays OUTERMOST-last — after every consumer 'end' segment — so its
    // 0.4.0 position (the row's final segment) holds whatever a consumer adds.
    if (props.resetTo !== undefined) out.push(segmentButton(resetSegment()));
    return out;
  };

  const rangeText = (): string => {
    const fmt = props.rangeFormat ?? ((v: number, _min: number, mx: number) => `${v} / ${mx}`);
    // `current()`, not `props.value`: inside a 'finish' session the prop is deliberately
    // stale, and a range rendered beside the stepped number must not disagree with it.
    return fmt(current(), min(), max());
  };

  const suffixNode = (): JSX.Element => (
    <>
      <Show when={props.suffix && !(current() === 0 && props.zeroLabel)}>
        <span class="cpnp-suffix">{props.suffix}</span>
      </Show>
      <Show when={props.showRange}>
        <span class="cpnp-range">{rangeText()}</span>
      </Show>
    </>
  );

  // Re-place once the panel has actually been laid out: the first `place()` runs before
    // the portalled panel is sized, so its measured height can be 0.
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
        onFocusOut={onWidgetFocusOut}
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
