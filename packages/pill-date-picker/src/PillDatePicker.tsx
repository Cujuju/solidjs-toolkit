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

  const commit = (index: number): void => {
    const item = props.items[index];
    if (!item) return;
    props.onChange(item);
    close(true);
  };

  /** Wrap so ArrowDown off the end lands on the first row rather than dead-ending. */
  const moveActive = (delta: number): void => {
    const n = props.items.length;
    if (n === 0) return;
    const from = activeIndex();
    // From "nothing active", a first ArrowDown must land on row 0, not row 1 — hence the
    // asymmetric seed rather than a plain (from + delta) on -1.
    const next =
      from === NO_ACTIVE_INDEX
        ? (delta > 0 ? 0 : n - 1)
        : (from + delta + n) % n;
    setActiveIndex(next);
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
    // surprise, and ArrowDown starts from where the user already is.
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
          setActiveIndex(props.items.length > 0 ? 0 : NO_ACTIVE_INDEX);
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(props.items.length - 1);
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
            return (
              <div
                class="cpdp-row"
                role="option"
                aria-selected={selected()}
                data-active={activeIndex() === i() ? 'true' : undefined}
                data-selected={selected() ? 'true' : undefined}
                onPointerEnter={() => setActiveIndex(i())}
                onClick={() => commit(i())}
              >
                <span class="cpdp-row-date">{labelOf(iso())}</span>
                {/* The colour is a style, not a class, because the ramp is caller-supplied:
                    the package cannot know the class names of a palette it does not own. */}
                <span class="cpdp-row-dte" style={{ color: resolveDteColor(dte(), ramp()) }}>
                  {formatDte(dte())}
                </span>
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
