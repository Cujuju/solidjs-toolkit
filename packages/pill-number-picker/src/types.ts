import type { JSX } from 'solid-js';

export type PnpLayout =
  | 'value-inc-dec'
  | 'value-dec-inc'
  | 'inc-value-dec'
  | 'dec-value-inc'
  | 'inc-dec-value'
  | 'dec-inc-value'
  | 'v-inc-value-dec'
  | 'v-dec-value-inc';

/**
 * What a custom segment's `onSelect` receives — the picker's own publish/session channel,
 * never raw internals.
 */
export interface PnpSegmentApi {
  /** The value at click time (draft-aware inside an editing session). */
  value: number;
  /**
   * Publish a value through the picker's own channel: clamped, rounded, draft-synced, and
   * inside a `commit:'finish'` session withheld from `onChange` until commit.
   */
  setValue: (v: number) => void;
  /** End an open editing session as a COMMIT (no-op when none is open). */
  commit: () => void;
  /** End an open editing session as a CANCEL (no-op when none is open). */
  cancel: () => void;
}

/**
 * A CUSTOM SEGMENT — a consumer-defined button joining the items row as a first-class member.
 * Declared as DATA, not JSX, so the component stays the owner of rendering.
 */
export interface PnpSegment {
  /** Stable, unique key — rendered as `data-pos="seg-<key>"` for CSS/tests. */
  key: string;
  /** Segment content: a glyph or short text. */
  icon: JSX.Element;
  /** aria-label. Required — every segment is labelled. */
  label: string;
  /**
   * 'start' renders before the layout's value/steppers, 'end' after. Array order is kept
   * within each side; a `resetTo` segment stays outermost-last. Default 'end'.
   */
  position?: 'start' | 'end';
  /** Disable predicate over the current value; omitted = always enabled. */
  disabled?: (current: number) => boolean;
  /** Click handler. `api.value` is a click-time snapshot. */
  onSelect: (api: PnpSegmentApi) => void;
  /** Width override (for text segments); defaults to the stepper button width. */
  width?: number | string;
}

export interface PillNumberPickerProps {
  value: number;
  onChange: (v: number) => void;

  // Range:
  min?: number;
  max?: number;
  step?: number;
  /**
   * Decimal places for parsing, rounding and display. Defaults to `step`'s own decimals; set
   * explicitly to override, or 0 to force integer mode.
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
   * COLLAPSE — at rest render the value ALONE, revealing the +/- on demand. The pop-out is
   * portalled and positioned in viewport coordinates, so a clipping ancestor cannot cut it off.
   */
  collapsible?: boolean;
  /**
   * EXCLUDE ZERO — 0 is not a legal value. Stepping across zero continues in the travel
   * direction; a typed 0 lands on the smallest step on the current side.
   */
  excludeZero?: boolean;
  /**
   * Controlled open state. Omit for uncontrolled (the component owns it).
   * Pair with `onOpenChange` to drive it yourself.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Gap in px between the collapsed value and the pop-out panel. Default 4. */
  popoutGap?: number;

  /**
   * WHEN the value is published. 'change' publishes every step; 'finish' steps a local draft
   * and publishes only on commit. The editing session is what this governs.
   */
  commit?: 'change' | 'finish';
  /** The value was CONFIRMED — Enter, or clicking the pill to close the editor. */
  onCommit?: (value: number) => void;
  /** The session was ABANDONED — Escape, or an outside pointerdown. Receives the value
   *  the picker is left holding (the pre-session value, unless `revertOnCancel={false}`). */
  onCancel?: (value: number) => void;
  /**
   * Cancel restores the value the session started with. Default true. In 'change' mode the
   * revert is an explicit `onChange`, since the consumer already saw the steps.
   */
  revertOnCancel?: boolean;

  // Display:
  /**
   * Click-to-type on the value cell. Default true. A COLLAPSED picker's cell click EXPANDS
   * instead; editing is then a click on the value inside the pop-out.
   */
  editable?: boolean;
  suffix?: string;
  zeroLabel?: string;
  displayValue?: (v: number) => string;

  // Icons:
  incrementIcon?: JSX.Element;
  decrementIcon?: JSX.Element;

  /**
   * RESET — the value this control treats as its default. Renders as one more segment after
   * the steppers and publishes through the SAME channel as a step.
   */
  resetTo?: number;
  /** Glyph for the reset segment. Default '↺'. */
  resetIcon?: JSX.Element;

  /**
   * CUSTOM SEGMENTS — consumer-defined buttons joining the items row. `resetTo` is sugar over
   * this same contract, so there is one render path for every segment.
   */
  segments?: PnpSegment[];

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
  /** aria-label for the reset segment. Default 'Reset'. */
  resetLabel?: string;
  disabled?: boolean;

  // Passthrough:
  class?: string;
}
