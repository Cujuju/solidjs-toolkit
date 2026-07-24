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
  /** Glyph rendered before the label when state=`included`. Default `'+ '`.
   *  Pass `''` to suppress. */
  includePrefix?: string;
  /** Glyph rendered before the label when state=`excluded`. Default `'− '`. */
  excludePrefix?: string;
  /** Glyph rendered before the label when state=`unselected`. Default `''`.
   *  Only consulted by the `glyph` indicator; the glyph column is reserved in
   *  every state, so leaving this empty leaves a visible blank where the glyph
   *  would go — supply a neutral mark (e.g. `'_ '`) to fill it. */
  neutralPrefix?: string;
  /**
   * How the chip signals its state.
   *
   * - `glyph` (default) — a leading `✓ ` / `✗ ` in the text flow, in a
   *   reserved column so width is stable. The neutral state has no glyph, so
   *   the column sits blank unless `neutralPrefix` fills it.
   * - `strike` — no glyph at all; the EXCLUDED label is struck through. The
   *   chip is exactly its label's width in every state, nothing reserved,
   *   nothing blank. Included stays tint-only.
   * - `marks` — `strike`, plus an underline on the INCLUDED label, so
   *   include / neutral is not distinguished by colour alone (WCAG 1.4.1).
   * - `badge` — a small ✓ / ✗ disc pinned to the chip's top-INLINE-end
   *   corner, out of flow. Keeps a literal glyph at zero layout cost; can be
   *   clipped by an ancestor with `overflow: hidden`.
   * - `rail` — a coloured stripe down the chip's inline-start edge, painted
   *   with an inset shadow so it never occupies layout.
   * - `tint` — background + text colour only, no glyph and no decoration.
   *
   * Every non-`glyph` indicator carries the state WITHOUT a character in the
   * text flow, so none of them reserve a column or need a neutral mark.
   */
  indicator?: 'glyph' | 'strike' | 'marks' | 'badge' | 'rail' | 'tint';
  /** ARIA label override. When omitted the chip relies on its visible text. */
  ariaLabel?: string;
  /** Extra class appended to the root. */
  class?: string;
  /** Style passthrough. */
  style?: JSX.CSSProperties;
  /** Data-attribute passthrough (e.g., `{ 'data-testid': 'genre-shounen' }`). */
  dataAttr?: Record<string, string>;
}

/* ✓ / ✗ rather than + / −: the chip answers "is this in or out", which is a
   yes/no, not an arithmetic operation. `+`/`−` also read as "add another" /
   "remove one" on a control that toggles a single item. The ballot X (U+2717)
   is the deliberate pair for the check — a multiplication sign (U+00D7) is
   lighter and reads as an operator rather than a rejection. */
const DEFAULT_INCLUDE_PREFIX = '✓ ';
const DEFAULT_EXCLUDE_PREFIX = '✗ ';
/** Empty by default: adding a neutral mark to every existing consumer's
 *  unselected chips would be a visual change they did not ask for. */
const DEFAULT_NEUTRAL_PREFIX = '';

/**
 * A single tri-state filter chip — one button that cycles through
 * `unselected` → `included` → `excluded` → `unselected` on click. Visual
 * theme via CSS custom properties on the `.ctc-chip` selector. Pure
 * presentation; state lives upstream (`TriStateValue`).
 *
 * For the whole flyout shell (trigger, panel, viewport clamping, dismiss
 * triggers, group headers) keep it in your app — this primitive is just the
 * button that lives inside that shell.
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
    props.indicator ?? 'glyph';

  /** Glyph for the CURRENT state. */
  const prefixGlyph = (): string =>
    props.value === 'included'
      ? includePrefix()
      : props.value === 'excluded'
        ? excludePrefix()
        : neutralPrefix();

  /** Whether the reserved glyph column renders. Only the `glyph` indicator
   *  uses it, and only when at least one state supplies a mark. */
  const hasPrefix = (): boolean =>
    indicator() === 'glyph' &&
    (includePrefix() !== '' || excludePrefix() !== '' || neutralPrefix() !== '');

  // aria-pressed semantics: a tri-state toggle is best expressed as
  // 'true' (pressed/non-neutral) vs 'false' (neutral). The specific
  // include-vs-exclude meaning is carried visually + via data-state for
  // CSS/automation. 'mixed' is reserved by the spec for partially-selected
  // GROUPS, not for distinguishing two pressed flavors of a single toggle.
  const ariaPressed = (): 'true' | 'false' =>
    props.value === 'unselected' ? 'false' : 'true';

  return (
    <button
      type="button"
      class={`ctc-chip ${props.class ?? ''}`.trim()}
      data-state={props.value}
      data-indicator={indicator()}
      // Set only when the CURRENT state shows no glyph, so the stylesheet can
      // centre the bare label without centring a label that has a glyph beside
      // it. Distinct from data-state: a `neutralPrefix` makes the neutral state
      // non-empty, and a custom cycle could leave include/exclude empty.
      data-glyph-empty={prefixGlyph() === '' ? '' : undefined}
      aria-pressed={ariaPressed()}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      style={props.style}
      onClick={handleClick}
      {...(props.dataAttr ?? {})}
    >
      {/* Leading glyph column, a FIXED `--ctc-glyph-col` wide in every state,
          so the chip's width never changes with state. The width is a token,
          not the glyph's intrinsic advance, precisely so the neutral-centering
          offset (below) can be exactly half of it — an intrinsic column has no
          value CSS can halve. A prefix wider than the token clips rather than
          shoving the label; size the token to your widest prefix.

          When the CURRENT state has no glyph (bare neutral), the label is
          shifted back by half the column to CENTRE it — see the `data-glyph-
          empty` rule in styles.css. When a glyph IS shown, the label stays
          offset after the column, so the glyph pushes it right. */}
      <Show when={hasPrefix()}>
        <span aria-hidden="true" class="ctc-chip-prefix">
          {prefixGlyph()}
        </span>
      </Show>
      <span class="ctc-chip-label">{props.label}</span>
    </button>
  );
}
