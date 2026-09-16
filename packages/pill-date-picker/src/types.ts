import type { JSX } from 'solid-js';
import type { DteColorStop } from './_internal/dte';
import type { PopoutPlacement } from './_internal/popout';

/**
 * An entry: a bare ISO string, or an object so a caller can hang their own payload off it —
 * `onChange` hands back the ORIGINAL item by reference.
 */
export type PillDateEntry = string | { date: string };

/**
 * The caller's verdict on a row: exactly what you asked for, takeable on terms you did not ask
 * for, or listed for other contracts and not yours.
 */
export type PillDateItemState = 'available' | 'adjusted' | 'disabled';

/**
 * Everything the default row derives, handed to {@link PillDatePickerProps.renderRow}. `label`,
 * `dteLabel` and `dteColor` are the SAME values the built-in row uses, with
 * `formatDate`/`dteRamp` applied.
 */
export interface PillDateRowContext<T extends PillDateEntry = PillDateEntry> {
  /** The caller's original item, by reference. */
  item: T;
  /** Its ISO date. */
  date: string;
  /** The row label the built-in row would render (honours `formatDate`). */
  label: string;
  /** Days to expiration — the caller's own number when they supplied `dteOf`,
   *  else calendar days, or null when there is none to show. */
  dte: number | null;
  /** The formatted DTE the built-in row would render (e.g. `34d`). */
  dteLabel: string;
  /**
   * The ramp colour the BUILT-IN row would paint, or `undefined` when there is none: an
   * unparseable date, an empty ramp, or a `'disabled'` row, which drops the ramp on purpose.
   */
  dteColor: string | undefined;
  state: PillDateItemState;
  /** The caller's own `annotation` for this item, if any. */
  annotation?: string;
  /** True when this row is the current `value`. */
  selected: boolean;
  /** True when this row holds the keyboard/pointer cursor. */
  active: boolean;
  index: number;
}

export interface PillDatePickerProps<T extends PillDateEntry = PillDateEntry> {
  /**
   * The valid expirations, in listing order. The control does not fetch, validate, sort or
   * filter them — deciding what exists is the caller's job; deciding how it LOOKS is this
   * component's.
   */
  items: readonly T[];
  /**
   * The selected expiration, as its KEY — see `keyOf`, which defaults to the ISO date. Keyed by
   * value, never identity: a refetch hands back structurally-equal items with new identities.
   */
  value?: string | null;
  /**
   * The stable key of an item; defaults to its ISO date. Supply it when a date is not unique
   * (AM/PM-settled index options share a day). Never use the array position.
   */
  keyOf?: (item: T) => string;
  /** Fires with the ORIGINAL item — payload keys intact. */
  onChange: (item: T) => void;

  /**
   * The clock DTE is measured from. Defaults to `new Date()`; injectable so DTE is testable
   * without mocking the clock, and for a pinned session date. Ignored when `dteOf` is supplied.
   */
  now?: Date;
  /**
   * This item's DTE when the caller owns that number; defaults to calendar days. A venue counts
   * the expiration day itself, so its number runs one higher — pass yours.
   */
  dteOf?: (item: T) => number | null;

  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
  /** Shown on the collapsed pill when nothing is selected. Default 'Select'. */
  placeholder?: string;
  /** Shown in the pop-out when `items` is empty. Default 'No expirations'. */
  emptyMessage?: string;
  /**
   * Shown above the rows when every row is `'disabled'` — said once rather than discovered five
   * times by clicking. Distinct from `emptyMessage`, which means no rows at all.
   */
  noneSelectableMessage?: string;

  /**
   * Controlled open state. Omit for uncontrolled (the component owns it).
   * Pair with `onOpenChange` to drive it yourself.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Gap in px between the collapsed pill and the pop-out panel. Default 4. */
  popoutGap?: number;
  /** Side to open toward when both fit. Default 'bottom' (a list reads downward). */
  preferPlacement?: PopoutPlacement;

  /**
   * Urgency ramp: ordered bands, first match wins. A prop because "urgent" is a house opinion;
   * the defaults resolve to `--pdp-dte-*` tokens, so CSS re-themes without touching it.
   */
  dteRamp?: readonly DteColorStop[];

  /** Override the `Jul 17` label — the escape hatch for locales the fixed format cannot serve. */
  formatDate?: (iso: string) => string;
  /**
   * Rows for the hover tooltip; defaults to the long date plus the DTE. Takes the whole item,
   * so a caller can surface their own payload here.
   */
  tooltipEntries?: (item: T, dte: number | null) => Record<string, string>;
  /** Suppress the hover tooltip entirely. */
  disableTooltip?: boolean;

  /**
   * Per-item state; defaults to `'available'`. `'adjusted'` is fully pickable — a caveat, not a
   * lesser row. `'disabled'` is rendered but inert, and stays VISIBLE: a ladder missing rows
   * misrepresents the calendar.
   */
  itemState?: (item: T) => PillDateItemState;
  /**
   * A short caller-authored note on the row. The package supplies no vocabulary — the reason
   * belongs to the domain. Keep it short; the long form goes in `tooltipEntries`.
   */
  annotation?: (item: T) => string | undefined;
  /**
   * Full control of a row's CONTENT, never the row element: the package keeps `role="option"`,
   * the state attributes, click-to-commit and the guarantee a `'disabled'` row cannot commit.
   * Prefer `itemState` + `annotation`.
   */
  renderRow?: (ctx: PillDateRowContext<T>) => JSX.Element;

  ariaLabel?: string;
  class?: string;
}
