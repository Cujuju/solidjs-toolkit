import {
  createSignal,
  createMemo,
  createEffect,
  createUniqueId,
  untrack,
  on,
  onCleanup,
  onMount,
  For,
  Show,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { createEscapeOwner, isEscapeDismissing } from '@cujuju/solidjs-hooks';
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
  isAnchorOutsideViewport,
  POPOUT_DEFAULT_GAP_PX,
  POPOUT_DEFAULT_PREFERENCE,
  type PopoutPosition,
  type PopoutPlacement,
} from './_internal/popout';

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

/** The ISO date of an entry, whichever shape it arrived in. */
function dateOf(item: PillDateEntry): string {
  return typeof item === 'string' ? item : item.date;
}

/** Nothing is active until the user navigates or a selection is found. */
const NO_ACTIVE_INDEX = -1;

/** Bundler-agnostic dev check — `import.meta.env` exists under Vite, and the
 *  optional chain keeps this harmless anywhere it does not. */
const isDev = Boolean(
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
);

export function PillDatePicker<T extends PillDateEntry = PillDateEntry>(
  props: PillDatePickerProps<T>,
): JSX.Element {
  /**
   * Instance id for the ARIA wiring: the combobox keeps DOM focus, so `aria-activedescendant` is
   * the only way a screen reader can announce the row the arrows are on.
   */
  const uid = createUniqueId();
  const panelId = `${uid}-listbox`;
  /** Row ids are derived from the row's KEY, so they follow the row across a
   *  re-supplied ladder exactly as the cursor does. */
  const rowId = (key: string): string => `${uid}-row-${encodeURIComponent(key)}`;

  const size = (): 'xs' | 'sm' | 'md' => props.size ?? 'md';
  const now = (): Date => props.now ?? new Date();
  const ramp = (): readonly DteColorStop[] => props.dteRamp ?? DEFAULT_DTE_RAMP;

  /** ONE definition of this item's DTE — the caller's if they own the number,
   *  else calendar days. Everything that shows a DTE flows through here. */
  const dteOf = (item: T): number | null => {
    const dte = props.dteOf ? props.dteOf(item) : daysToExpiration(dateOf(item), now());
    // Non-finite is "none to show" too: the documented `null`, for every consumer downstream.
    return dte !== null && Number.isFinite(dte) ? dte : null;
  };
  const labelOf = (iso: string): string =>
    props.formatDate ? props.formatDate(iso) : formatMonthDay(iso);

  /** The item's selection key — the caller's if they gave one, else its date. Every
   *  comparison against `value` goes through here; nothing compares dates directly. */
  const keyOf = (item: T): string => (props.keyOf ? props.keyOf(item) : dateOf(item));

  /**
   * Caller's verdict per item, memoized per (items × itemState) change: `itemState` can do real
   * work and is consulted by the renderer, every arrow scan and the commit guard.
   */
  const stateByKey = createMemo<Map<string, PillDateItemState>>(() => {
    const map = new Map<string, PillDateItemState>();
    for (const item of props.items) {
      const key = keyOf(item);
      // A duplicate key is a caller bug: two rows share one state, `value` selects both, and
      // duplicate row ids make `aria-activedescendant` ambiguous. Dev-only.
      if (isDev && map.has(key)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[pill-date-picker] duplicate key "${key}" in items — rows will share state, ` +
            'selection and DOM ids. Supply a `keyOf` that names the contract, not its date.',
        );
      }
      map.set(key, props.itemState?.(item) ?? 'available');
    }
    return map;
  });
  const stateOf = (item: T): PillDateItemState => stateByKey().get(keyOf(item)) ?? 'available';

  /**
   * The ladder as its KEYS. `<For>` reconciles by REFERENCE, so a re-supplied ladder rebuilt
   * every row; keys compare by value, so equal contents leave the rows alone.
   */
  const itemKeys = createMemo<string[]>(
    () => props.items.map(keyOf),
    [],
    { equals: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );

  /**
   * Key → the CURRENT item under it. A keyed row reads its item through this, so a re-supplied
   * ladder updates the row in place.
   */
  const itemByKey = createMemo<Map<string, T>>(() => {
    const map = new Map<string, T>();
    for (const item of props.items) map.set(keyOf(item), item);
    return map;
  });
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
  /** Open AND operable: the one predicate the panel, its listeners and its ARIA share. A
   *  controlled parent can hold `open` true across `disabled`. Memo, so only the boolean re-runs effects. */
  const isPanelOpen = createMemo<boolean>(() => isOpen() && !props.disabled);

  /**
   * The cursor is stored as the row's KEY, never its index: a re-supplied ladder makes "row 3" a
   * different contract. Keyed, the cursor follows its row or disappears.
   */
  const [activeKey, setActiveKey] = createSignal<string | null>(null);
  const activeIndex = createMemo<number>(() => {
    const k = activeKey();
    if (k === null) return NO_ACTIVE_INDEX;
    return props.items.findIndex((i) => keyOf(i) === k);
  });
  const setActiveIndex = (index: number): void => {
    const item = index === NO_ACTIVE_INDEX ? undefined : props.items[index];
    setActiveKey(item ? keyOf(item) : null);
  };
  const [popout, setPopout] = createSignal<PopoutPosition | null>(null);
  let anchorEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  /**
   * Measure and place the panel; returns whether the anchor is in view. Re-runs on scroll and
   * resize — CAPTURING, since the scrolling ancestor is rarely `window`.
   */
  const place = (): boolean => {
    // No anchor to measure: report in-view, because "unknown" must never close the ladder.
    if (!anchorEl) return true;
    const a = anchorEl.getBoundingClientRect();
    // The LAYOUT viewport — the space the rects and `position: fixed` live in, excluding classic scrollbars.
    const viewport = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    // Hide, never close, here: `place` runs inside opening. Residual: only the viewport is checked, not clipping ancestors.
    if (isAnchorOutsideViewport(a, viewport)) {
      setPopout(null);
      return false;
    }
    if (!panelEl) return true;
    const p = panelEl.getBoundingClientRect();
    setPopout(
      resolvePopoutPosition(
        { top: a.top, left: a.left, width: a.width, height: a.height },
        { width: p.width, height: p.height },
        viewport,
        props.popoutGap ?? POPOUT_DEFAULT_GAP_PX,
        props.preferPlacement ?? POPOUT_DEFAULT_PREFERENCE,
      ),
    );
    return true;
  };

  const close = (refocus: boolean): void => {
    setOpen(false);
    setActiveIndex(NO_ACTIVE_INDEX);
    // Returning focus to the pill matters: without it, closing from the keyboard drops focus
    // onto <body> and the tab order restarts from the top of the document.
    if (refocus) anchorEl?.focus();
  };

  /**
   * Fail-closed commit: a disabled item can never reach `onChange`, whatever route asked — a row
   * click, a click inside a custom `renderRow`, or Enter on a cursor that landed there.
   */
  const commit = (index: number): void => {
    // A control the caller disabled must not act, even with a panel already on screen — the rows
    // are portalled and still under the pointer.
    if (props.disabled) return;
    const item = props.items[index];
    if (!item) return;
    if (stateOf(item) === 'disabled') return;
    props.onChange(item);
    close(true);
  };

  /**
   * Wrap at the ends and STEP OVER disabled rows: a cursor that lands where Enter refuses to act
   * reads as broken. Bounded, so an all-disabled ladder settles on nothing active.
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

  /** True when the ladder has rows and every one of them is disabled. */
  const noneSelectable = createMemo<boolean>(
    () => props.items.length > 0 && props.items.every((i) => stateOf(i) === 'disabled'),
  );

  /** First / last row the user can actually act on (Home / End). */
  const edgeEnabled = (from: 'first' | 'last'): number => {
    const n = props.items.length;
    for (let i = 0; i < n; i++) {
      const index = from === 'first' ? i : n - 1 - i;
      if (!disabledAt(index)) return index;
    }
    return NO_ACTIVE_INDEX;
  };

  /*
   * Which open picker owns the keyboard: each binds to the DOCUMENT, so two open pickers would
   * both act on one keypress. `createEscapeOwner` holds one toolkit-wide stack on `globalThis`.
   */
  /**
   * Escape DISMISSES this picker — but only while it is the topmost open surface in the app, and
   * it consumes the key, so the surface underneath keeps its own Escape.
   */
  const escapeOwner = createEscapeOwner({
    open: isPanelOpen,
    // Ownership alone, no `isOurs` gate: it made a ladder opened with focus elsewhere
    // un-dismissable and blocked pickers below.
    onDismiss: () => close(true),
    // A custom `renderRow` may hold its own editor; an Escape inside the panel reaches it first.
    owns: () => [panelEl],
  });

  /**
   * Everything true only while the pop-out is open: placement, reflow, dismissal, the list's
   * keyboard. Outside-press closes on `pointerdown`; the document keyboard serves only keys
   * aimed at the pill or panel.
   */
  createEffect(() => {
    if (!isPanelOpen()) {
      setPopout(null);
      return;
    }
    // Open with the current selection under the cursor, so Enter is a no-op. UNTRACKED: reading
    // `items`/`value` here would re-run this effect on every re-supply, teleporting the cursor
    // mid-interaction.
    untrack(() => setActiveKey(props.value ?? null));
    // Untracked too: `place` reads `popoutGap`/`preferPlacement`, which the placement effect owns.
    // Seeds the reflow edge so a hidden ladder is not read as a departure.
    let anchorWasInView = untrack(place);

    // The keyboard owner is claimed above, for `isPanelOpen()`'s whole lifetime; only the
    // navigation keys below are scoped to this effect.
    const ownsKeyboard = escapeOwner.isTop;
    /** Aimed at the pill, the panel, or nothing focused. The composed path, because at `document` the target is retargeted to any shadow host. */
    const isOurs = (e: Event): boolean => {
      const path = e.composedPath();
      const origin = path[0] ?? e.target;
      return (
        origin === document ||
        origin === document.body ||
        (!!anchorEl && path.includes(anchorEl)) ||
        (!!panelEl && path.includes(panelEl))
      );
    };

    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (panelEl?.contains(t)) return;
      if (anchorEl?.contains(t)) return; // the pill's own click toggles; don't double-handle
      close(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      // Only the top of the stack acts; a picker underneath another one must not
      // silently commit the keypress its neighbour is receiving.
      if (!ownsKeyboard()) return;
      if (!isOurs(e)) return;
      switch (e.key) {
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
          // Owned even with no active row: unprevented, the focused pill's native activation clicks it shut.
          e.preventDefault();
          if (activeIndex() === NO_ACTIVE_INDEX) return;
          commit(activeIndex());
          break;
        default:
      }
    };
    const onReflow = (): void => {
      const isInView = place();
      // Once, on leaving the viewport: a controlled parent that ignores it keeps a hidden panel, not a request per scroll.
      if (anchorWasInView && !isInView) close(false);
      anchorWasInView = isInView;
    };
    // Focus moving to another control — Tab included — takes the ladder with it.
    const onFocusIn = (e: FocusEvent): void => {
      // Escape dismisses ONE layer: the focus the layer above hands back on its way out is not
      // the user leaving this one.
      if (isEscapeDismissing()) return;
      if (!isOurs(e)) close(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    // The shared owner stops Escape before ancestor handlers run: in capture, or at the panel for
    // in-panel Escapes. Navigation/commit keys stay in the bubble phase, after the element's own.
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('resize', onReflow);
    // Capture: the scroll that moves us is almost never on `window`.
    window.addEventListener('scroll', onReflow, true);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    });
  });

  /**
   * Disabling a control with its ladder open must put the ladder away: the trigger's guards
   * cannot cover a panel already on screen and portalled to <body>.
   */
  createEffect(() => {
    if (props.disabled && isOpen()) close(false);
  });

  /** Re-place when the caller moves the placement inputs while open. `on` untracks `place` itself. */
  createEffect(
    on(
      () => [props.popoutGap, props.preferPlacement],
      () => {
        if (isPanelOpen()) place();
      },
      { defer: true },
    ),
  );

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

  /** The cursor's key only while a row carrying it is rendered — an IDREF to nothing is a lie. */
  const activeRowKey = (): string | null => (activeIndex() === NO_ACTIVE_INDEX ? null : activeKey());

  const trigger = (): JSX.Element => (
    <button
      ref={anchorEl}
      type="button"
      class="cpdp-pill"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={isPanelOpen()}
      aria-controls={isPanelOpen() ? panelId : undefined}
      // Points at the row the arrows are on, and only while open: a closed combobox owning a
      // descendant that is not in the document is a lie.
      aria-activedescendant={isPanelOpen() && activeRowKey() !== null ? rowId(activeRowKey()!) : undefined}
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
      {/* The colour is a style, not a class: the ramp is caller-supplied, so the
                package cannot know a palette's class names. A disabled row drops the ramp. */}
      <span
        class="cpdp-row-dte"
        style={p.ctx.state === 'disabled' ? undefined : { color: p.ctx.dteColor }}
      >
        {p.ctx.dteLabel}
      </span>
    </>
  );

  // ── Pop-out panel ────────────────────────────────────────────────────
  // Re-place once the panel has been laid out: the first `place()` runs before the
  // portalled panel is sized, so its measured height can be 0.
  const PanelBody = (): JSX.Element => {
    onMount(() => place());
    // Re-place whenever the panel's own size changes: rows arriving, a status line, a wrapped note.
    onMount(() => {
      if (!panelEl || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => place());
      observer.observe(panelEl);
      onCleanup(() => observer.disconnect());
    });
    return (
      <>
        {/* Both messages are live regions sitting OUTSIDE the listbox: a listbox may
                    only contain options, and their text changes underneath a user already
                    looking at it. `role="status"` is polite. */}
        <Show when={props.items.length === 0}>
          <div class="cpdp-empty" role="status">{props.emptyMessage ?? 'No expirations'}</div>
        </Show>
        {/* Rows exist but not one of them is takeable. They stay on screen —
            deleting them would misrepresent the calendar — with the reason
            stated once at the top. */}
        <Show when={props.items.length > 0 && noneSelectable()}>
          <div class="cpdp-empty" role="status">
            {props.noneSelectableMessage ?? 'Nothing selectable'}
          </div>
        </Show>
        <div
          id={panelId}
          class="cpdp-list"
          role="listbox"
          tabIndex={-1}
          aria-label={props.ariaLabel}
        >
        {/* Iterating the KEYS, not the items — see `itemKeys`. */}
        <For each={itemKeys()}>
          {(key, i) => {
            /**
             * This row's CURRENT item, looked up by key rather than captured: the row
             * outlives any single `items` array. The fallback covers one frame — `<For>`
             * reconciles keys before disposing departing rows.
             */
            let lastItem = itemByKey().get(key)!;
            const item = (): T => {
              const fresh = itemByKey().get(key);
              if (fresh !== undefined) lastItem = fresh;
              return lastItem;
            };
            const iso = (): string => dateOf(item());
            /**
             * MEMOIZED, both: every context field is read at least once per pass and
             * `dte` three times, each read parsing the ISO date and allocating a `Date`.
             */
            const dte = createMemo<number | null>(() => dteOf(item()));
            const label = createMemo<string>(() => labelOf(iso()));
            // Compare on the KEY, not the date. With two same-date contracts in the ladder
            // (SPX / SPXW), a date comparison would light up BOTH rows as selected.
            const selected = (): boolean => props.value === key;
            const state = (): PillDateItemState => stateByKey().get(key) ?? 'available';
            /**
             * Compare KEYS, not indices: `activeIndex` scans the ladder, so asking it per
             * row turns a cursor move into an O(n²) sweep. The key comparison is O(1).
             */
            const isActive = (): boolean => activeKey() === key;
            const note = (): string | undefined => props.annotation?.(item());
            /**
             * ONE object per row, every field a GETTER: a custom row is called once to
             * build its JSX, so plain values would freeze it. Same values the built-in row
             * renders.
             */
            const ctx: PillDateRowContext<T> = {
              get item() { return item(); },
              get index() { return i(); },
              get date() { return iso(); },
              get label() { return label(); },
              get dte() { return dte(); },
              get dteLabel() { return formatDte(dte()); },
              get dteColor() {
                return state() === 'disabled' ? undefined : resolveDteColor(dte(), ramp());
              },
              get state() { return state(); },
              get annotation() { return note(); },
              get selected() { return selected(); },
              get active() { return isActive(); },
            };
            return (
              <div
                id={rowId(key)}
                class="cpdp-row"
                role="option"
                aria-selected={selected()}
                // Announced, not just styled: `aria-disabled` (not `disabled`) because the row
                // stays in the listbox and remains readable — unavailable, not absent.
                aria-disabled={state() === 'disabled' ? 'true' : undefined}
                data-state={state()}
                data-active={isActive() ? 'true' : undefined}
                data-selected={selected() ? 'true' : undefined}
                // A disabled row never takes the cursor: the highlight must always sit
                // somewhere Enter will act, or the two inputs disagree about what is
                // selected.
                onPointerEnter={() => {
                  if (state() !== 'disabled') setActiveIndex(i());
                }}
                onClick={() => commit(i())}
              >
                <Show when={props.renderRow} fallback={<DefaultRow ctx={ctx} />}>
                  {(render) => render()(ctx)}
                </Show>
              </div>
            );
          }}
        </For>
        </div>
      </>
    );
  };

  return (
    <div class={`cpdp-root cpdp-size-${size()} ${props.class ?? ''}`.trim()}>
      {/* The pill shows ONLY the date; the tooltip carries the DTE and is suppressed
                while open. Always mounted: a `<Show>`'s branches would both claim `anchorEl`. */}
      <KvTooltip
        entries={tooltipEntries()}
        disabled={(props.disableTooltip ?? false) || isPanelOpen()}
        class="cpdp-trigger-wrap"
      >
        {trigger()}
      </KvTooltip>

      {/* `!props.disabled` as well as `isOpen()`: a controlled parent owns the open
                flag, so disabling can only ASK it to close. Rendering is ours even when the
                open state is not. */}
      <Show when={isPanelOpen()}>
        <Portal>
          {/* The positioned, scrolling SHELL — deliberately role-less. The
              listbox is the row container inside it, so the status messages can
              be siblings of the list rather than illegal children of it. */}
          <div
            ref={panelEl}
            class={`cpdp-popout cpdp-size-${size()}`}
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
