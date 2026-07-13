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
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
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
    if (!editing()) setDraft(formatValue(props.value, precision()));
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
    const next = clamp(props.value + delta);
    setDraft(formatValue(next, precision()));
    props.onChange(next);
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
  const commitDraft = (): void => {
    setEditing(false);
    const parsed = parseValue(draft(), precision());
    if (parsed === null) {
      setDraft(formatValue(props.value, precision()));
      return;
    }
    const clamped = clamp(parsed);
    setDraft(formatValue(clamped, precision()));
    if (clamped !== props.value) props.onChange(clamped);
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
      const next = clamp(props.value + step() * direction);
      if (next === props.value) { stopRepeat(); return; }
      props.onChange(next);
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
    if (e.key === 'ArrowUp') next = clamp(props.value + step());
    else if (e.key === 'ArrowDown') next = clamp(props.value - step());
    else if (e.key === 'PageUp') next = clamp(props.value + step() * 10);
    else if (e.key === 'PageDown') next = clamp(props.value - step() * 10);
    else if (e.key === 'Home') next = min();
    else if (e.key === 'End') next = max();
    if (next !== null) {
      e.preventDefault();
      if (next !== props.value) props.onChange(next);
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
      disabled={props.disabled || props.value >= max()}
      aria-label={props.incrementLabel ?? 'Increase'}
      onClick={() => {
        if (props.disabled) return;
        props.onChange(clamp(props.value + step()));
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
      disabled={props.disabled || props.value <= min()}
      aria-label={props.decrementLabel ?? 'Decrease'}
      onClick={() => {
        if (props.disabled) return;
        props.onChange(clamp(props.value - step()));
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
    props.value === 0 && props.zeroLabel
      ? props.zeroLabel
      : (props.displayValue ? props.displayValue(props.value) : formatValue(props.value, precision()));

  /**
   * The value cell.
   *
   * `where` matters because a collapsed picker's value cell is a DIFFERENT control
   * from the one inside the pop-out:
   *   'collapsed' — the resting anchor. Its click EXPANDS (it does not edit; see the
   *                 `editable` doc). Arrow keys and the wheel still step it, so the
   *                 common case never has to expand at all.
   *   'panel'     — the real thing, inside the pop-out. Click edits, as always.
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
            aria-valuenow={props.value}
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
              if (collapsedCell) { setOpen(true); return; }
              if (editable()) setEditing(true);
            }}
            onKeyDown={(e) => {
              // Enter / Space open the pop-out from the keyboard — without this the
              // +/- are mouse-only for a collapsed picker.
              if (collapsedCell && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setOpen(true);
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
          onBlur={commitDraft}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
            else if (e.key === 'Escape') { setEditing(false); setDraft(String(props.value)); }
            else onKeyDown(e);
          }}
        />
      </Show>
    );
  };

  /** While the pop-out is open, the anchor holds the row's LAYOUT and nothing else —
   *  the live control is in the panel. Marked aria-hidden so a screen reader is not
   *  offered the same spinbutton twice. */
  const anchorPlaceholder = (): JSX.Element => (
    <span
      class="cpnp-value"
      aria-hidden="true"
      data-placeholder="true"
      style={{
        width: 'max-content',
        'min-width': valueWidth(),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
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
