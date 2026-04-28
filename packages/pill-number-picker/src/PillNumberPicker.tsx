import { createSignal, createEffect, onCleanup, Show, type JSX } from 'solid-js';
import {
  effectivePrecision,
  clampAndRound,
  parseValue,
  formatValue,
} from './_internal/precision';
import { autoValueWidthPx } from './_internal/layout';

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

  // Display:
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
  createEffect(() => {
    if (props.disableWheel) return;
    const el = rootEl;
    if (!el) return;

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

  const valueNode = (): JSX.Element => {
    const commonStyle: JSX.CSSProperties = {
      width: valueWidth(),
      height: toCssSize(props.height),
      'font-size': toCssSize(props.fontSize),
    };
    return (
      <Show
        when={editing() && editable()}
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
            style={{
              ...commonStyle,
              cursor: editable() ? 'text' : 'default',
            }}
            onClick={() => { if (editable()) setEditing(true); }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            {props.value === 0 && props.zeroLabel
              ? props.zeroLabel
              : (props.displayValue ? props.displayValue(props.value) : formatValue(props.value, precision()))}
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
          style={commonStyle}
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

  // ── Layout assembly ──────────────────────────────────────────────────
  const items = (): JSX.Element[] => {
    const parts = layout().replace(/^v-/, '').split('-') as Array<'value' | 'inc' | 'dec'>;
    return parts.map((p) => {
      if (p === 'value') return valueNode();
      if (p === 'inc') return incButton();
      return decButton();
    });
  };

  const rangeText = (): string => {
    const fmt = props.rangeFormat ?? ((v: number, _min: number, mx: number) => `${v} / ${mx}`);
    return fmt(props.value, min(), max());
  };

  return (
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
      <Show when={props.suffix && !(props.value === 0 && props.zeroLabel)}>
        <span class="cpnp-suffix">{props.suffix}</span>
      </Show>
      <Show when={props.showRange}>
        <span class="cpnp-range">{rangeText()}</span>
      </Show>
    </div>
  );
}
