import { createSignal, createEffect, on } from 'solid-js';
import { effectivePrecision, clampAndRound, formatValue } from './_internal/precision';
import { autoValueWidthPx } from './_internal/layout';
import { toCssSize } from './_internal/cssSize';
import type { PnpLayout, PillNumberPickerProps } from './types';

export function createPickerSession(props: PillNumberPickerProps) {
  let inputEl: HTMLInputElement | undefined;
  let anchorEl: HTMLDivElement | undefined;
  let panelEl: HTMLDivElement | undefined;
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
  // A signal, not a `let`: flipping `collapsible` swaps the root, and the wheel effect must re-bind.
  const [rootEl, setRootEl] = createSignal<HTMLDivElement>();

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
    } else if (pending !== null && pending !== props.value) {
      // Kept, not reverted: a 'finish' draft was never published, so keeping it means publishing it.
      props.onChange(pending);
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

  /** Part of this widget: the in-flow root OR the portalled panel, which is not inside it. */
  const insideWidget = (node: Node | null): boolean =>
    !!node && (!!rootEl()?.contains(node) || !!panelEl?.contains(node));
  /** Focus left the widget for a real target, so a pending close must not pull it back. */
  const onWidgetFocusOut = (e: FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    if (next && !insideWidget(next)) returnFocusOnClose = false;
  };

  return {
    min, max, step, size, layout,
    editable, precision, valueWidth, clamp, resolveStep,
    resolveSet, editing, setEditing, draft, setDraft,
    rootEl, setRootEl, collapsible, isOpen, setOpen,
    isCollapsed, sessionOpen, current, emit, openEditor,
    beginEditing, commitSession, cancelSession, insideWidget, onWidgetFocusOut,
    get inputEl() { return inputEl; },
    set inputEl(value: HTMLInputElement | undefined) { inputEl = value; },
    get anchorEl() { return anchorEl; },
    set anchorEl(value: HTMLDivElement | undefined) { anchorEl = value; },
    get panelEl() { return panelEl; },
    set panelEl(value: HTMLDivElement | undefined) { panelEl = value; },
    get closeDecided() { return closeDecided; },
    set closeDecided(value: boolean) { closeDecided = value; },
  };
}
