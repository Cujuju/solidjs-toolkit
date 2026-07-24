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
   *  In `prefixMode="reserve"` the glyph column is reserved in every state, so
   *  leaving this empty leaves a visible blank where the glyph would go —
   *  supply a neutral mark (e.g. `'○ '`) to fill it. */
  neutralPrefix?: string;
  /**
   * How the glyph occupies space.
   *
   * - `reserve` (default) — the glyph sits in the layout flow, in a column as
   *   wide as the widest of the three glyphs. Width is identical in every
   *   state, at the cost of a permanent column.
   * - `overlay` — the glyph is taken OUT of flow and painted inside the chip's
   *   existing start padding. The chip measures the same as a chip with no
   *   glyph at all, in every state, and there is no column to leave blank. The
   *   trade is that the glyph has only the padding to live in, so a wide
   *   prefix will crowd the label.
   */
  prefixMode?: 'reserve' | 'overlay';
  /** ARIA label override. When omitted the chip relies on its visible text. */
  ariaLabel?: string;
  /** Extra class appended to the root. */
  class?: string;
  /** Style passthrough. */
  style?: JSX.CSSProperties;
  /** Data-attribute passthrough (e.g., `{ 'data-testid': 'genre-shounen' }`). */
  dataAttr?: Record<string, string>;
}

const DEFAULT_INCLUDE_PREFIX = '+ ';
const DEFAULT_EXCLUDE_PREFIX = '− ';
/** Empty by default: adding a neutral mark to every existing consumer's
 *  unselected chips would be a visual change they did not ask for. */
const DEFAULT_NEUTRAL_PREFIX = '';

/**
 * Quote an arbitrary prefix as a CSS string literal for `content:`.
 *
 * The prefix is consumer-supplied, so it goes through the escape hatch a CSS
 * string needs: backslash first (or it would double-escape the quote it is
 * about to introduce), then the quote, then newlines — a raw newline
 * terminates a CSS string and would invalidate the whole declaration,
 * collapsing the sizer to zero width.
 */
function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`;
}

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
  const prefixMode = (): 'reserve' | 'overlay' => props.prefixMode ?? 'reserve';

  /** Glyph for the CURRENT state. */
  const prefixGlyph = (): string =>
    props.value === 'included'
      ? includePrefix()
      : props.value === 'excluded'
        ? excludePrefix()
        : neutralPrefix();

  /** Whether this chip has a glyph column at all (see the slot comment). */
  const hasPrefix = (): boolean =>
    includePrefix() !== '' || excludePrefix() !== '' || neutralPrefix() !== '';

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
      aria-pressed={ariaPressed()}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      style={props.style}
      onClick={handleClick}
      {...(props.dataAttr ?? {})}
    >
      {/* ONE prefix slot, rendered in every state. Rendering it conditionally
          made the chip's width content-driven, so it grew the instant a glyph
          appeared and the whole row of chips reflowed on click.

          `reserve` keeps it in flow in a column as wide as the widest glyph;
          `overlay` takes it out of flow into the start padding, so there is no
          column to leave blank. Either way every state measures the same.

          Suppressed entirely when ALL THREE prefixes are empty: that consumer
          wants no glyph at all, and reserving space for one would be dead
          padding. */}
      <Show when={hasPrefix()}>
        <span
          aria-hidden="true"
          class="ctc-chip-prefix"
          data-mode={prefixMode()}
          style={{
            '--ctc-sizer-include': cssString(includePrefix()),
            '--ctc-sizer-exclude': cssString(excludePrefix()),
            '--ctc-sizer-neutral': cssString(neutralPrefix()),
          }}
        >
          {/* Sizers: all three possible glyphs share the visible glyph's grid
              cell, so the cell resolves to the WIDEST prefix and the chip
              measures identically in all three states. They carry their text
              as CSS `content` rather than as child text nodes on purpose — a
              hidden text node still lands in `textContent`, so selecting and
              copying a chip would yield "+ − calls", and text queries would
              match the sizers. Pseudo-element content is not part of
              `textContent`.

              Overlay mode needs no sizers: the glyph is out of flow, so there
              is nothing to size. */}
          <Show when={prefixMode() === 'reserve'}>
            <span class="ctc-chip-prefix-sizer" data-sizer="include" />
            <span class="ctc-chip-prefix-sizer" data-sizer="exclude" />
            <span class="ctc-chip-prefix-sizer" data-sizer="neutral" />
          </Show>
          <span class="ctc-chip-prefix-glyph">{prefixGlyph()}</span>
        </span>
      </Show>
      <span class="ctc-chip-label">{props.label}</span>
    </button>
  );
}
