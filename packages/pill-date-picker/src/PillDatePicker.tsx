import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  onMount,
  For,
  Show,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';
import {
  daysToExpiration,
  formatMonthDay,
  formatLongDate,
  formatDte,
  resolveDteColor,
  DEFAULT_DTE_RAMP,
  type DteColorStop,
} from './_internal/dte';
import {
  resolvePopoutPosition,
  POPOUT_DEFAULT_GAP_PX,
  POPOUT_DEFAULT_PREFERENCE,
  type PopoutPosition,
  type PopoutPlacement,
} from './_internal/popout';

/**
 * An entry in the expiration list.
 *
 * Two shapes, because callers come in two kinds. A bare ISO string covers the trivial case.
 * The object form exists so a caller can hang THEIR OWN payload off each expiration (open
 * interest, IV, a broker's contract id, whatever) and get it back intact — `onChange` hands
 * back the ORIGINAL item by reference, never a stringified or reconstructed copy. The
 * generic parameter is what carries those extra keys through to the handler with their types
 * still attached.
 */
export type PillDateEntry = string | { date: string };

/**
 * What a row is, from the CALLER's point of view. The control renders the
 * difference; it never decides it.
 *
 * The three exist because "can I pick this?" is not a boolean in a real ladder.
 * An expiration can be exactly what you asked for, or takeable on terms you did
 * not ask for (a chain whose strike grid coarsens with time has no rung at your
 * strike four months out, but it has one nearby), or listed for other contracts
 * and not for yours. Collapsing the middle case into either neighbour is what
 * pushes consumers into hijacking `formatDate` to smuggle a marker into the
 * label, or into deleting rows from `items` so the user cannot tell "not for
 * you" from "does not exist".
 */
export type PillDateItemState = 'available' | 'adjusted' | 'disabled';

/**
 * Everything the default row derives, handed to {@link PillDatePickerProps.renderRow}
 * so a custom row never has to re-implement (or re-guess) any of it.
 *
 * `label`, `dteLabel` and `dteColor` are the SAME values the built-in row uses —
 * `formatDate` and `dteRamp` are already applied — so a caller who only wants to
 * add a column keeps the package's formatting for the columns they did not touch.
 */
export interface PillDateRowContext<T extends PillDateEntry = PillDateEntry> {
  /** The caller's original item, by reference. */
  item: T;
  /** Its ISO date. */
  date: string;
  /** The row label the built-in row would render (honours `formatDate`). */
  label: string;
  /** Calendar days to expiration, or null when the date is unparseable. */
  dte: number | null;
  /** The formatted DTE the built-in row would render (e.g. `34d`). */
  dteLabel: string;
  /**
   * The ramp colour for that DTE, or `undefined` when there is nothing to
   * colour by — an unparseable date, or an empty ramp. Passed through
   * verbatim rather than defaulted, so a custom row inherits the same honest
   * "no urgency known" the built-in row renders instead of a fabricated hue.
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
   * The valid expirations, in the order they should be listed.
   *
   * The control does NOT fetch, validate, sort, or filter these — every date supplied is
   * assumed to be a legitimate expiration. Deciding what exists is the caller's job and
   * theirs alone; deciding how it LOOKS is this component's.
   */
  items: readonly T[];
  /**
   * The selected expiration, as its KEY — see `keyOf`. By default that key is the ISO date.
   *
   * Keyed by value, never by object identity: a caller who refetches their chain gets
   * structurally-equal items with brand-new identities, and an identity-keyed selection
   * would silently deselect on every refresh.
   */
  value?: string | null;
  /**
   * The stable key of an item. Defaults to its ISO date.
   *
   * Supply this when a date is NOT unique in your ladder — which is not a hypothetical:
   * AM- and PM-settled index options (SPX and SPXW on the third Friday) are two different
   * contracts on the same calendar day. Keyed by date alone, this control cannot tell them
   * apart and would select the wrong one.
   *
   * The key must be STABLE ACROSS REFETCHES, and that is why it is yours to supply rather
   * than something the control derives. A tempting-but-broken choice is the item's POSITION
   * in the array: rebuild the ladder after a weekly expires and position 3 now names a
   * different expiration, so the selection silently moves to the wrong contract — a failure
   * that is worse than deselecting, because nothing about it looks wrong. Use an id, an OCC
   * root, `${date}:${settlement}` — anything that names the CONTRACT rather than its slot.
   */
  keyOf?: (item: T) => string;
  /** Fires with the ORIGINAL item — payload keys intact. */
  onChange: (item: T) => void;

  /**
   * The clock DTE is measured from. Defaults to `new Date()`.
   *
   * Injectable because DTE is the one number here that can be WRONG, and a function that
   * reaches for the ambient clock can only be tested by mocking the clock — which tests the
   * mock. A caller pinning a session date (backtesting, a replay view) also gets correct
   * DTE for free.
   */
  now?: Date;

  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
  /** Shown on the collapsed pill when nothing is selected. Default 'Select'. */
  placeholder?: string;
  /** Shown in the pop-out when `items` is empty. Default 'No expirations'. */
  emptyMessage?: string;

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
   * Urgency ramp for the DTE colour: ordered bands, first match wins.
   *
   * A prop rather than a constant because "urgent" is a house opinion — the consuming app's
   * thresholds and palette are its own. The default bands are calendar boundaries (today /
   * this week / this month / beyond) and resolve to `--pdp-dte-*` tokens, so the common case
   * is re-themed from CSS without touching this prop at all.
   */
  dteRamp?: readonly DteColorStop[];

  /** Override the `Jul 17` label — the escape hatch for locales the fixed format cannot serve. */
  formatDate?: (iso: string) => string;
  /**
   * Rows for the hover tooltip. Defaults to the long date + the DTE.
   *
   * Takes the whole item, so a caller with payload can surface it here (open interest,
   * volume, "monthly") without this package knowing anything about their domain.
   */
  tooltipEntries?: (item: T, dte: number | null) => Record<string, string>;
  /** Suppress the hover tooltip entirely. */
  disableTooltip?: boolean;

  /**
   * Per-item state. Defaults to `'available'` for every item, which is exactly
   * the pre-0.2 behaviour.
   *
   * `'adjusted'` is offered and fully pickable — it is a row with a caveat, not
   * a lesser row, and hiding it behind a disabled style would be a lie about
   * what the user can do. `'disabled'` is rendered but inert: it cannot be
   * clicked, the arrow keys step over it, and it never takes the cursor. It
   * stays VISIBLE on purpose — a ladder silently missing its unavailable rows
   * misrepresents the market's calendar.
   */
  itemState?: (item: T) => PillDateItemState;
  /**
   * A short caller-authored note rendered on the row (`≈ 145`, `PM settle`,
   * `no puts listed`). The package supplies no vocabulary of its own here: the
   * reason a row is what it is belongs to the domain, not to a date picker.
   *
   * Keep it to a few characters — the row is one line in a dense pop-out. The
   * long form belongs in `tooltipEntries`.
   */
  annotation?: (item: T) => string | undefined;
  /**
   * Full control of a row's CONTENT — the escape hatch for a row shape the
   * built-in date/annotation/DTE layout cannot express.
   *
   * It replaces what is INSIDE the row, never the row element itself. The
   * package keeps ownership of the parts that are easy to get wrong and
   * invisible when they are: `role="option"`, the selected/active/disabled
   * state attributes, click-to-commit, the pointer cursor, and the guarantee
   * that a `'disabled'` row cannot be committed no matter what a custom row
   * renders inside it (a nested button's click still bubbles into the same
   * guarded handler).
   *
   * Prefer `itemState` + `annotation` where they fit: they keep every consumer's
   * ladder looking like the same control. Reach for this when they do not.
   */
  renderRow?: (ctx: PillDateRowContext<T>) => JSX.Element;

  ariaLabel?: string;
  class?: string;
}

/** The ISO date of an entry, whichever shape it arrived in. */
function dateOf(item: PillDateEntry): string {
  return typeof item === 'string' ? item : item.date;
}

/** Nothing is active until the user navigates or a selection is found. */
const NO_ACTIVE_INDEX = -1;

export function PillDatePicker<T extends PillDateEntry = PillDateEntry>(
  props: PillDatePickerProps<T>,
): JSX.Element {
  const size = (): 'xs' | 'sm' | 'md' => props.size ?? 'md';
  const now = (): Date => props.now ?? new Date();
  const ramp = (): readonly DteColorStop[] => props.dteRamp ?? DEFAULT_DTE_RAMP;

  const dteOf = (item: T): number | null => daysToExpiration(dateOf(item), now());
  const labelOf = (iso: string): string =>
    props.formatDate ? props.formatDate(iso) : formatMonthDay(iso);

  /** The item's selection key — the caller's if they gave one, else its date. Every
   *  comparison against `value` goes through here; nothing compares dates directly. */
  const keyOf = (item: T): string => (props.keyOf ? props.keyOf(item) : dateOf(item));

  /** Caller's verdict for an item; absent prop = everything available. */
  const stateOf = (item: T): PillDateItemState => props.itemState?.(item) ?? 'available';
  /** Out-of-range indices count as disabled so every caller below is total. */
  const disabledAt = (index: number): boolean => {
    const item = props.items[index];
    return !item || stateOf(item) === 'disabled';
  };

  const selectedItem = createMemo<T | undefined>(() => {
    const v = props.value;
    if (v === null || v === undefined) return undefined;
    return props.items.find((i) => keyOf(i) === v);
  });

  // ── Open state ───────────────────────────────────────────────────────
  const [openUncontrolled, setOpenUncontrolled] = createSignal(false);
  // Controlled when `open` is supplied; uncontrolled otherwise. `onOpenChange` fires either
  // way, so a controlled parent stays authoritative and an uncontrolled one can still observe.
  const isOpen = (): boolean => props.open ?? openUncontrolled();
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setOpenUncontrolled(next);
    props.onOpenChange?.(next);
  };

  const [activeIndex, setActiveIndex] = createSignal(NO_ACTIVE_INDEX);
  const [popout, setPopout] = createSignal<PopoutPosition | null>(null);
  let anchorEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  /**
   * Measure and place the panel.
   *
   * Runs after the panel is in the DOM (its size is not knowable before), and again on
   * scroll and resize: the panel is `position: fixed`, so ANY scroll of ANY ancestor moves
   * the anchor out from under it. The scroll listener is CAPTURING (third arg `true`)
   * precisely because the scrolling ancestor is usually not `window` — it is the consumer's
   * own scroll container, and a bubbling listener would never hear it (scroll does not
   * bubble from an element).
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
        props.preferPlacement ?? POPOUT_DEFAULT_PREFERENCE,
      ),
    );
  };

  const close = (refocus: boolean): void => {
    setOpen(false);
    setActiveIndex(NO_ACTIVE_INDEX);
    // Returning focus to the pill matters: without it, closing from the keyboard drops focus
    // onto <body> and the tab order restarts from the top of the document.
    if (refocus) anchorEl?.focus();
  };

  /**
   * Fail-closed commit: a disabled item can never reach `onChange`, whatever
   * route asked for it — a click on the row, a click on something a custom
   * `renderRow` put INSIDE the row, or an Enter on a cursor that somehow landed
   * there. The keyboard already steps over disabled rows and they never take
   * the pointer cursor; this is the guard that makes those two facts
   * unnecessary rather than load-bearing.
   */
  const commit = (index: number): void => {
    const item = props.items[index];
    if (!item) return;
    if (stateOf(item) === 'disabled') return;
    props.onChange(item);
    close(true);
  };

  /**
   * Wrap so ArrowDown off the end lands on the first row rather than dead-ending,
   * and STEP OVER disabled rows: a cursor that can land somewhere Enter refuses
   * to act reads as a broken control.
   *
   * Bounded by the row count, so a ladder where every row is disabled settles on
   * "nothing active" instead of spinning.
   */
  const moveActive = (delta: number): void => {
    const n = props.items.length;
    if (n === 0) return;
    const from = activeIndex();
    // From "nothing active", a first ArrowDown must land on row 0, not row 1 — hence the
    // asymmetric seed rather than a plain (from + delta) on -1.
    let next =
      from === NO_ACTIVE_INDEX
        ? (delta > 0 ? 0 : n - 1)
        : (from + delta + n) % n;
    for (let step = 0; step < n; step++) {
      if (!disabledAt(next)) {
        setActiveIndex(next);
        return;
      }
      next = (next + delta + n) % n;
    }
    setActiveIndex(NO_ACTIVE_INDEX); // every row disabled — nowhere to go
  };

  /** First / last row the user can actually act on (Home / End). */
  const edgeEnabled = (from: 'first' | 'last'): number => {
    const n = props.items.length;
    for (let i = 0; i < n; i++) {
      const index = from === 'first' ? i : n - 1 - i;
      if (!disabledAt(index)) return index;
    }
    return NO_ACTIVE_INDEX;
  };

  /**
   * Everything that is only true while the pop-out is open: placement, reflow, dismissal,
   * and the list's keyboard.
   *
   * Outside-press closes on `pointerdown` rather than `click`: a click fires after the press
   * completes, so a user pressing a control in a neighbouring row would otherwise interact
   * with a panel that is still on top of it.
   *
   * The keyboard is bound to the DOCUMENT, not to the panel: an open list owns the arrows
   * regardless of where focus happens to sit, and binding to the panel would silently do
   * nothing whenever the consumer's own focus management moved focus elsewhere.
   */
  createEffect(() => {
    if (!isOpen()) {
      setPopout(null);
      return;
    }
    // Open with the current selection under the cursor, so Enter is a no-op rather than a
    // surprise, and ArrowDown starts from where the user already is. Seeded even when that
    // row is now DISABLED: moving the cursor to a different row would make Enter pick a
    // value the user never chose, which is the surprise this seeding exists to avoid. The
    // commit guard already refuses it, and the first arrow key steps to a usable row.
    const preselected = props.items.findIndex((i) => keyOf(i) === props.value);
    setActiveIndex(preselected);
    place();

    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (panelEl?.contains(t)) return;
      if (anchorEl?.contains(t)) return; // the pill's own click toggles; don't double-handle
      close(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'Escape':
          e.stopPropagation();
          close(true);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveActive(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveActive(-1);
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(edgeEnabled('first'));
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(edgeEnabled('last'));
          break;
        case 'Enter':
        case ' ':
          if (activeIndex() === NO_ACTIVE_INDEX) return;
          e.preventDefault();
          commit(activeIndex());
          break;
        default:
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

  // ── Collapsed pill ───────────────────────────────────────────────────
  const collapsedLabel = (): string => {
    const sel = selectedItem();
    return sel ? labelOf(dateOf(sel)) : (props.placeholder ?? 'Select');
  };

  const defaultTooltipEntries = (item: T, dte: number | null): Record<string, string> => ({
    Expires: formatLongDate(dateOf(item)),
    DTE: formatDte(dte),
  });

  /** Empty entries make KvTooltip render nothing at all — which is exactly what an unselected
   *  pill (nothing to describe) and a disabled tooltip should both do. */
  const tooltipEntries = (): Record<string, string> => {
    const sel = selectedItem();
    if (!sel) return {};
    const dte = dteOf(sel);
    return props.tooltipEntries
      ? props.tooltipEntries(sel, dte)
      : defaultTooltipEntries(sel, dte);
  };

  const onTriggerKeyDown = (e: KeyboardEvent): void => {
    if (props.disabled) return;
    // Down-arrow-to-open is the listbox convention and costs nothing; without it the ladder
    // is reachable only by Enter/Space, which reads as a button, not a picker.
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      if (isOpen()) return; // the open-effect's document handler owns these once open
      e.preventDefault();
      setOpen(true);
    }
  };

  const trigger = (): JSX.Element => (
    <button
      ref={anchorEl}
      type="button"
      class="cpdp-pill"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={isOpen()}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      data-empty={selectedItem() ? undefined : 'true'}
      onClick={() => {
        if (props.disabled) return;
        // Toggle, not open: a second click on the pill is the user asking to put it away.
        isOpen() ? close(false) : setOpen(true);
      }}
      onKeyDown={onTriggerKeyDown}
    >
      {collapsedLabel()}
    </button>
  );

  /**
   * The built-in row: date, optional note, DTE. Extracted so `renderRow` and the
   * default share ONE row element (state attributes, click, cursor) and differ
   * only in what is drawn inside it.
   */
  const DefaultRow = (p: { ctx: PillDateRowContext<T> }): JSX.Element => (
    <>
      <span class="cpdp-row-date">{p.ctx.label}</span>
      <Show when={p.ctx.annotation}>
        {(note) => <span class="cpdp-row-note">{note()}</span>}
      </Show>
      {/* The colour is a style, not a class, because the ramp is caller-supplied:
          the package cannot know the class names of a palette it does not own.
          A disabled row drops the ramp: urgency is a call to act, and this row
          cannot be acted on — it would be shouting about an unavailable date. */}
      <span
        class="cpdp-row-dte"
        style={p.ctx.state === 'disabled' ? undefined : { color: p.ctx.dteColor }}
      >
        {p.ctx.dteLabel}
      </span>
    </>
  );

  // ── Pop-out panel ────────────────────────────────────────────────────
  // Re-place once the panel has actually been laid out. The first `place()` inside the
  // open-effect runs before the browser has sized the portalled panel, so its measured height
  // can be 0 — which would resolve the placement against a phantom.
  const PanelBody = (): JSX.Element => {
    onMount(() => place());
    return (
      <>
        <Show when={props.items.length === 0}>
          <div class="cpdp-empty">{props.emptyMessage ?? 'No expirations'}</div>
        </Show>
        <For each={props.items}>
          {(item, i) => {
            const iso = (): string => dateOf(item);
            const dte = (): number | null => dteOf(item);
            // Compare on the KEY, not the date. With two same-date contracts in the ladder
            // (SPX / SPXW), a date comparison would light up BOTH rows as selected.
            const selected = (): boolean => props.value === keyOf(item);
            const state = (): PillDateItemState => stateOf(item);
            const note = (): string | undefined => props.annotation?.(item);
            /**
             * The same values the built-in row renders — see PillDateRowContext.
             *
             * Every changing field is a GETTER, not a value. A custom `renderRow`
             * is called ONCE to build its JSX, so a plain object would hand it a
             * snapshot: `ctx.active` would be whatever it was at first paint and
             * the custom row would never see the cursor move (or the selection
             * change, or a re-supplied annotation). Getters make the read happen
             * where the consumer actually reads it — inside their JSX, which
             * Solid compiles to a tracked expression — so the frozen-value trap
             * cannot be fallen into by a caller who did nothing wrong.
             *
             * `item` and `index` are the row's identity and do not change under
             * it, so they stay plain values.
             */
            const rowContext = (): PillDateRowContext<T> => ({
              item,
              index: i(),
              get date() { return iso(); },
              get label() { return labelOf(iso()); },
              get dte() { return dte(); },
              get dteLabel() { return formatDte(dte()); },
              get dteColor() { return resolveDteColor(dte(), ramp()); },
              get state() { return state(); },
              get annotation() { return note(); },
              get selected() { return selected(); },
              get active() { return activeIndex() === i(); },
            });
            return (
              <div
                class="cpdp-row"
                role="option"
                aria-selected={selected()}
                // Announced, not just styled: a screen reader must hear that the row is
                // inert. `aria-disabled` (not `disabled`) because the row stays in the
                // listbox and remains readable — it is unavailable, not absent.
                aria-disabled={state() === 'disabled' ? 'true' : undefined}
                data-state={state()}
                data-active={activeIndex() === i() ? 'true' : undefined}
                data-selected={selected() ? 'true' : undefined}
                // A disabled row never takes the cursor: the highlight must always sit
                // somewhere Enter will act, or the two inputs disagree about what is
                // selected.
                onPointerEnter={() => {
                  if (state() !== 'disabled') setActiveIndex(i());
                }}
                onClick={() => commit(i())}
              >
                <Show when={props.renderRow} fallback={<DefaultRow ctx={rowContext()} />}>
                  {(render) => render()(rowContext())}
                </Show>
              </div>
            );
          }}
        </For>
      </>
    );
  };

  return (
    <div class={`cpdp-root cpdp-size-${size()} ${props.class ?? ''}`.trim()}>
      {/* Collapsed, the pill shows ONLY the date — the DTE is what the tooltip is FOR.
          Suppressed while open: the ladder already shows every DTE, and a tooltip floating
          over the panel that replaced it is noise on top of the answer.

          The wrapper is always mounted and the tooltip is suppressed via `disabled`, rather
          than mounting the pill under a <Show> with an unwrapped fallback. Both branches of
          such a Show would construct their own <button> and each would claim `anchorEl` on
          creation — leaving the ref pointing at whichever element was built last, which is
          not necessarily the one in the document. The pop-out would then be placed against a
          detached node. */}
      <KvTooltip
        entries={tooltipEntries()}
        disabled={(props.disableTooltip ?? false) || isOpen()}
        class="cpdp-trigger-wrap"
      >
        {trigger()}
      </KvTooltip>

      <Show when={isOpen()}>
        <Portal>
          <div
            ref={panelEl}
            class={`cpdp-popout cpdp-size-${size()}`}
            role="listbox"
            tabIndex={-1}
            aria-label={props.ariaLabel}
            data-placement={popout()?.placement}
            style={{
              position: 'fixed',
              top: `${popout()?.top ?? 0}px`,
              left: `${popout()?.left ?? 0}px`,
              // Until the first measurement lands, the panel would otherwise paint at 0,0 for
              // one frame — a flash in the top-left corner of the screen.
              visibility: popout() ? 'visible' : 'hidden',
            }}
          >
            <PanelBody />
          </div>
        </Portal>
      </Show>
    </div>
  );
}
