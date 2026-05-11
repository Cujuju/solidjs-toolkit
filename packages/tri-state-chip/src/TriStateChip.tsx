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
      <Show when={props.value === 'included' && includePrefix()}>
        <span aria-hidden="true" class="ctc-chip-prefix">
          {includePrefix()}
        </span>
      </Show>
      <Show when={props.value === 'excluded' && excludePrefix()}>
        <span aria-hidden="true" class="ctc-chip-prefix">
          {excludePrefix()}
        </span>
      </Show>
      <span class="ctc-chip-label">{props.label}</span>
    </button>
  );
}
