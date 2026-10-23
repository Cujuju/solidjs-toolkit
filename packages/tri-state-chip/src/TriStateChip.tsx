import { type JSX, Show } from 'solid-js';
import type { TriState } from './cycleTriState';
import { cycleTriState } from './cycleTriState';

export interface TriStateChipProps {
  /** Display content for the chip body. Plain text or arbitrary JSX. */
  label: JSX.Element;
  /** Current state. */
  value: TriState;
  /** Fired with the NEXT state when the chip is clicked. Consumer owns the
   *  upstream `TriStateValue` shape; use `applyTriState(value, item, next)`
   *  from this package to compute the new value. */
  onCycle: (next: TriState) => void;
  /** Disable interaction + visually dim. */
  disabled?: boolean;
  /** Override the cycle order. Default is {@link cycleTriState} (unselected
   *  → included → excluded → unselected). */
  nextState?: (current: TriState) => TriState;
  /** Glyph rendered before the label when state=`included`. Default `'✓ '`.
   *  Pass `''` to suppress. Only consulted by the `glyph` indicator. */
  includePrefix?: string;
  /** Glyph rendered before the label when state=`excluded`. Default `'✗ '`.
   *  Only consulted by the `glyph` indicator. */
  excludePrefix?: string;
  /** Glyph before the label when state=`unselected`. Default `''`. `glyph` indicator only;
   *  its column is always reserved, so empty leaves a visible blank. */
  neutralPrefix?: string;
  /**
   * State signal. `hatch` (default) stripes the chip; `strike`/`cut` mark the label;
   * `glyph` adds a leading ✓/✗ column; `marks`, `badge`, `rail`, `tint` — see styles.css.
   */
  indicator?: 'glyph' | 'strike' | 'cut' | 'hatch' | 'marks' | 'badge' | 'rail' | 'tint';
  /**
   * Per-chip hatch geometry, e.g. `'45deg'`; writes `--ctc-hatch-*` inline. CSS strings, not
   * numbers, so units like `em` survive. Only used by `indicator="hatch"`.
   */
  hatchAngle?: string;
  /** Bar width, e.g. `'4px'`. See {@link TriStateChipProps.hatchAngle}. */
  hatchStripeWidth?: string;
  /** Space between bars, e.g. `'6px'`. See {@link TriStateChipProps.hatchAngle}. */
  hatchGapWidth?: string;
  /** Words announced for the non-neutral states; ria-pressed alone cannot tell them apart.
   *  Default { included: 'included', excluded: 'excluded' }. */
  stateText?: Partial<Record<Exclude<TriState, 'unselected'>, string>>;
  /** ARIA label override. When omitted the chip relies on its visible text. */
  ariaLabel?: string;
  /** Extra class appended to the root. */
  class?: string;
  /** Style passthrough. */
  style?: JSX.CSSProperties;
  /** Data-attribute passthrough (e.g., `{ 'data-testid': 'genre-shounen' }`). */
  dataAttr?: Record<string, string>;
}

/* ✓/✗ not +/−: the chip answers in/out, not add/remove. Ballot X (U+2717) pairs with the
   check; × (U+00D7) reads as an operator. */
const DEFAULT_INCLUDE_PREFIX = '✓ ';
const DEFAULT_EXCLUDE_PREFIX = '✗ ';
/** Empty by default: adding a neutral mark to every existing consumer's
 *  unselected chips would be a visual change they did not ask for. */
const DEFAULT_NEUTRAL_PREFIX = '';

/** `hatch` marks the control, not the word: no reserved glyph column, width equals the
 *  label, and the label is never defaced. */
const DEFAULT_INDICATOR = 'hatch' as const;

const DEFAULT_STATE_TEXT = { included: 'included', excluded: 'excluded' } as const;

/** Visually hidden, still in the accessible name. */
const SR_ONLY_STYLE: JSX.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  'white-space': 'nowrap',
  border: '0',
};

/**
 * One tri-state filter chip cycling unselected → included → excluded on click. Themed via
 * `.ctc-chip` custom properties; state lives upstream (`TriStateValue`).
 */
export function TriStateChip(props: TriStateChipProps): JSX.Element {
  const next = (): TriState =>
    (props.nextState ?? cycleTriState)(props.value);

  const handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (props.disabled) return;
    props.onCycle(next());
  };

  const includePrefix = (): string =>
    props.includePrefix ?? DEFAULT_INCLUDE_PREFIX;
  const excludePrefix = (): string =>
    props.excludePrefix ?? DEFAULT_EXCLUDE_PREFIX;
  const neutralPrefix = (): string =>
    props.neutralPrefix ?? DEFAULT_NEUTRAL_PREFIX;
  const indicator = (): NonNullable<TriStateChipProps['indicator']> =>
    props.indicator ?? DEFAULT_INDICATOR;

  /** Emitted only when supplied: an empty-string custom property invalidates every `var()`
   *  reading it, collapsing the gradient. */
  const hatchVars = (): JSX.CSSProperties => ({
    ...(props.hatchAngle !== undefined ? { '--ctc-hatch-angle': props.hatchAngle } : {}),
    ...(props.hatchStripeWidth !== undefined
      ? { '--ctc-hatch-stripe-width': props.hatchStripeWidth }
      : {}),
    ...(props.hatchGapWidth !== undefined
      ? { '--ctc-hatch-gap-width': props.hatchGapWidth }
      : {}),
  });

  const prefixGlyph = (): string =>
    props.value === 'included'
      ? includePrefix()
      : props.value === 'excluded'
        ? excludePrefix()
        : neutralPrefix();

  const hasPrefix = (): boolean =>
    indicator() === 'glyph' &&
    (includePrefix() !== '' || excludePrefix() !== '' || neutralPrefix() !== '');

  // aria-pressed is true for any non-neutral state; 'mixed' is spec-reserved for
  // partially-selected groups. Include vs exclude is carried by `stateLabel` in the name.
  const ariaPressed = (): 'true' | 'false' =>
    props.value === 'unselected' ? 'false' : 'true';

  const stateLabel = (): string =>
    props.value === 'unselected'
      ? ''
      : (props.stateText?.[props.value] ?? DEFAULT_STATE_TEXT[props.value]);

  /** An override replaces content in the name, so the state is appended to it too. */
  const ariaLabel = (): string | undefined =>
    props.ariaLabel !== undefined && stateLabel() !== ''
      ? `${props.ariaLabel}, ${stateLabel()}`
      : props.ariaLabel;

  return (
    <button
      type="button"
      class={`ctc-chip ${props.class ?? ''}`.trim()}
      data-state={props.value}
      data-indicator={indicator()}
      // Only when the current state shows no glyph, so CSS centres the bare label. Not
      // data-state: prefixes can be custom. Needs hasPrefix(): no column, no shift.
      data-glyph-empty={hasPrefix() && prefixGlyph() === '' ? '' : undefined}
      aria-pressed={ariaPressed()}
      aria-label={ariaLabel()}
      disabled={props.disabled}
      // `style` first: the named hatch props are the more specific statement,
      // so if a caller sets both, the prop wins over a raw custom property in
      // `style`.
      style={{ ...props.style, ...hatchVars() }}
      onClick={handleClick}
      {...(props.dataAttr ?? {})}
    >
      {/* Fixed-width column (a token, so CSS can halve it to centre a glyph-less
                label); wider prefixes clip. See styles.css. */}
      <Show when={hasPrefix()}>
        <span aria-hidden="true" class="ctc-chip-prefix">
          {prefixGlyph()}
        </span>
      </Show>
      <span class="ctc-chip-label">{props.label}</span>
      <Show when={stateLabel()}>
        <span class="ctc-chip-state" style={SR_ONLY_STYLE}>, {stateLabel()}</span>
      </Show>
    </button>
  );
}
