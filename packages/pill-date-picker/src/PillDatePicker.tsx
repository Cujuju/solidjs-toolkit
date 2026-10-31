import { createEscapeOwner, isEscapeDismissing } from '@cujuju/solidjs-hooks';
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
  type JSX,
} from 'solid-js';
import type { PopoutPosition } from './_internal/popout';
import { createDatePickerActions } from './createDatePickerActions';
import { createPillDateModel, NO_ACTIVE_INDEX } from './createPillDateModel';
import { renderPillDatePicker } from './PillDatePickerView';
import {
  type PillDateEntry,
  type PillDateItemState,
  type PillDatePickerProps,
  type PillDateRowContext,
} from './types';
export type { PillDateEntry, PillDateItemState, PillDatePickerProps, PillDateRowContext };

export function PillDatePicker<T extends PillDateEntry = PillDateEntry>(
  props: PillDatePickerProps<T>,
): JSX.Element {
  const model = createPillDateModel(props);
  const { rowId, stateOf, disabledAt, setActiveKey, activeIndex, setActiveIndex } = model;

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

  const [popout, setPopout] = createSignal<PopoutPosition | null>(null);
  let anchorEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;

  const { place, close, commit, activeRowKey } = createDatePickerActions(
    props, model, { get anchorEl() { return anchorEl; }, get panelEl() { return panelEl; } },
    setOpen, setPopout,
  );

  /** Wrap at the ends, skipping disabled rows. The bounded scan leaves nothing active when every row is disabled. */
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

  /** Reveal the cursor row on keyboard navigation and open. Hover scrolling could move successive rows under a stationary pointer. */
  const revealActiveRow = (): void => {
    const key = activeRowKey();
    if (!panelEl || key === null) return;
    const row = document.getElementById(rowId(key));
    if (!row) return;
    const viewTop = panelEl.getBoundingClientRect().top + panelEl.clientTop;
    const viewBottom = viewTop + panelEl.clientHeight;
    const r = row.getBoundingClientRect();
    if (r.top < viewTop) panelEl.scrollTop -= viewTop - r.top;
    else if (r.bottom > viewBottom) panelEl.scrollTop += r.bottom - viewBottom;
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
  /** Consume Escape and dismiss only when this picker is the topmost open surface, preserving the underlying surface. */
  const escapeOwner = createEscapeOwner({
    open: isPanelOpen,
    // Ownership alone, no `isOurs` gate: it made a ladder opened with focus elsewhere
    // un-dismissable and blocked pickers below.
    onDismiss: () => close(true),
    // A custom `renderRow` may hold its own editor; an Escape inside the panel reaches it first.
    owns: () => [panelEl],
  });

  /** While open, maintain placement, reflow, dismissal and navigation. Outside pointerdown dismisses; document keyboard handling serves keys aimed at the pill or panel. */
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
      // A key custom row content consumed (an input's Space, say) is not ours to act on.
      if (e.defaultPrevented) return;
      if (!isOurs(e)) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveActive(1);
          revealActiveRow();
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveActive(-1);
          revealActiveRow();
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(edgeEnabled('first'));
          revealActiveRow();
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(edgeEnabled('last'));
          revealActiveRow();
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

  return renderPillDatePicker(props, {
    ...model, isOpen, setOpen, isPanelOpen, close, commit, noneSelectable,
    place, revealActiveRow, popout,
    get anchorEl() { return anchorEl; },
    set anchorEl(el: HTMLButtonElement | undefined) { anchorEl = el; },
    get panelEl() { return panelEl; },
    set panelEl(el: HTMLDivElement | undefined) { panelEl = el; },
  });
}
