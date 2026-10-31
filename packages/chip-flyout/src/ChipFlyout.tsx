import {
  contains,
  createAfterPaint,
  createClickOutside,
  createEscapeOwner,
  createOutsideScrollDismiss,
  createResizeObserver,
} from '@cujuju/solidjs-hooks';
import {
  children,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
  type JSX,
} from 'solid-js';
import { getGlobalTarget, safeAddEventListener } from './_internal/safeEvent';
import { DEFAULT_PANEL_MIN, renderChipFlyout } from './ChipFlyoutView';
import { createChipOptions } from './createChipOptions';
import type { ChipFlyoutProps } from './types';
export type { ChipFlyoutProps, ChipFlyoutTab, ChipOption } from './types';

/** Start the next page this far before the list bottom scrolls into view. */
const LOAD_MORE_PREFETCH_PX = 120;

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return p;
  }
  return null;
}
const PANEL_OFFSET_PX = 4;
/** Minimum gap the panel keeps from any viewport edge when clamped. */
export const VIEWPORT_MARGIN_PX = 8;
/** Touch-first devices, where focusing a text input raises the soft keyboard. */
const COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * Secondary-button trigger opening a Portal'd glass menu of chip options. The panel follows
 * the trigger's rect and closes on outside click, Escape, resize or page scroll.
 */
export function ChipFlyout(props: ChipFlyoutProps): JSX.Element {
  const [internalOpen, setInternalOpen] = createSignal(false);
  const [pos, setPos] = createSignal<{ top: number; left: number } | null>(
    null,
  );
  let triggerEl: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;
  const afterPaint = createAfterPaint();

  const isControlled = () => props.open !== undefined;
  const open = () => (isControlled() ? !!props.open : internalOpen());
  // The panel mounts only once it has a position; everything keyed to its
  // presence (Show, viewport clamp) reads this, not `open` alone.
  const panelShown = createMemo(() => open() && pos() !== null);
  // Read once, only while shown: each read of a JSX prop builds a new tree.
  const topSlot = children(() => (panelShown() ? props.topSlot : undefined));
  let loadMoreSentinel: HTMLButtonElement | undefined;

  // Infinite scroll. Re-armed whenever a load settles: a fresh observer reports the current
  // intersection, so a page too short to fill the panel keeps loading until it overflows.
  createEffect(() => {
    if (!panelShown() || !props.hasMore || !props.onLoadMore || props.loading) return;
    const el = loadMoreSentinel;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) untrack(() => props.onLoadMore?.());
      },
      { root: scrollParentOf(el), rootMargin: `0px 0px ${LOAD_MORE_PREFETCH_PX}px 0px` },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  function setOpen(next: boolean) {
    // `onOpenChange` reports changes; a redundant request (e.g. resize while closed) is not one.
    if (next === open()) return;
    if (isControlled()) {
      props.onOpenChange?.(next);
    } else {
      setInternalOpen(next);
      props.onOpenChange?.(next);
    }
  }

  const options = createChipOptions(props, panelShown);

  function computePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const placement = props.placement ?? 'bottom-start';
    const top = rect.bottom + PANEL_OFFSET_PX;
    // Pre-mount estimate: width is unknown, so bottom-end assumes minWidth. `placePanel` corrects it.
    const left =
      placement === 'bottom-end'
        ? Math.max(
            VIEWPORT_MARGIN_PX,
            rect.right - (props.panelMinWidth ?? DEFAULT_PANEL_MIN),
          )
        : rect.left;
    setPos({ top, left });
  }

  function openPanel() {
    if (props.disabled) return;
    computePosition();
    setOpen(true);
  }

  /** Move focus into the dialog: search input, else active tab, else the panel. */
  function focusPanel(): void {
    if (!panelEl?.isConnected) return;
    // On touch, focusing search raises the soft keyboard, whose resize would dismiss the panel.
    const coarsePointer =
      typeof window.matchMedia === 'function' && window.matchMedia(COARSE_POINTER_QUERY).matches;
    const target =
      (coarsePointer ? null : panelEl.querySelector<HTMLElement>('.cujuju-cf-search')) ??
      panelEl.querySelector<HTMLElement>('[role="tab"][tabindex="0"]') ??
      panelEl;
    target.focus({ preventScroll: true });
  }

  /** Place the rendered panel from the trigger rect and its measured size: right-align for
   *  `bottom-end`, keep it inside the viewport, flip above when it overflows the bottom. */
  function placePanel(): void {
    const current = pos();
    if (!panelEl || !triggerEl || !current) return;
    const panel = panelEl.getBoundingClientRect();
    const trigger = triggerEl.getBoundingClientRect();

    const anchorLeft =
      (props.placement ?? 'bottom-start') === 'bottom-end' ? trigger.right - panel.width : trigger.left;
    const maxLeft = window.innerWidth - panel.width - VIEWPORT_MARGIN_PX;
    const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(anchorLeft, maxLeft));

    let top = trigger.bottom + PANEL_OFFSET_PX;
    if (top + panel.height > window.innerHeight - VIEWPORT_MARGIN_PX) {
      const flipped = trigger.top - panel.height - PANEL_OFFSET_PX;
      top = flipped >= VIEWPORT_MARGIN_PX ? flipped : VIEWPORT_MARGIN_PX;
    }

    if (top !== current.top || left !== current.left) setPos({ top, left });
  }

  // Place once the panel has painted (real size), then again whenever its size changes:
  // async options and load-more can grow it past the viewport.
  createEffect(() => {
    if (!panelShown() || !panelEl) return;
    afterPaint(placePanel);
  });
  createResizeObserver(() => (panelShown() ? panelEl : undefined), placePanel);

  /** `restoreFocus: false` (outside clicks) leaves focus where the user put it.
   *  The restore itself runs when the panel actually hides — see the focus effect. */
  function closePanel(restoreFocus = true) {
    restoreFocusOnClose = restoreFocus;
    setOpen(false);
  }

  // Focus contract keyed to the panel's real presence: trigger-, dismiss- and parent-driven
  // opens/closes behave alike, and a vetoed close moves nothing.
  let restoreFocusOnClose = true;
  // Last focus move landed inside the panel. Removal-blur has no relatedTarget, so it keeps this set.
  let focusInPanel = false;
  // A flyout mounted open must not steal focus from the page.
  let skipFocusOnFirstShow = untrack(open);
  createEffect(
    on(panelShown, (shown, wasShown) => {
      if (shown) {
        if (skipFocusOnFirstShow) skipFocusOnFirstShow = false;
        else focusPanel();
        return;
      }
      if (!wasShown) return;
      const restore = restoreFocusOnClose && focusInPanel;
      restoreFocusOnClose = true;
      focusInPanel = false;
      if (restore) triggerEl?.focus({ preventScroll: true });
    }),
  );

  function toggle() {
    if (open()) closePanel();
    else openPanel();
  }

  // Dismiss triggers. `createClickOutside` is pointerdown + capture-phase
  // with opening-gesture suppression; `createEscapeOwner` closes on Esc while this flyout is
  // topmost. Both are gated on `open`.
  createClickOutside(
    contains(() => [triggerEl, panelEl]),
    () => closePanel(false),
    { enabled: open },
  );
  createEscapeOwner({
    open,
    onDismiss: () => closePanel(),
    // A control inside the panel keeps its own Escape by calling `preventDefault`.
    owns: () => [panelEl],
  });

  // Close on viewport resize — a fixed-position panel desyncs from its
  // trigger when the viewport changes size. Always-on; `closePanel`
  // while closed is a no-op.
  safeAddEventListener(getGlobalTarget('window'), 'resize', () =>
    closePanel(),
  );

  // Close on PAGE scroll (anchor desync). In-panel scrolls — wheel over
  // the chip list — must NOT dismiss; the primitive filters those by
  // target containment.
  createOutsideScrollDismiss(open, () => panelEl, closePanel);

  // Re-position when a controlled `open` flips true with the trigger already rendered;
  // otherwise the panel lands at its last-computed position.
  createEffect(
    on(
      () => props.open,
      (isOpen) => {
        if (isOpen) computePosition();
      },
      // Not deferred: a controlled `open={true}` at mount needs a position too.
      { defer: false },
    ),
  );

  return renderChipFlyout(props, {
    ...options, open, toggle, panelShown, pos, topSlot, closePanel,
    get panelEl() { return panelEl; },
    set panelEl(value: HTMLDivElement | undefined) { panelEl = value; },
    get triggerEl() { return triggerEl; },
    set triggerEl(value: HTMLButtonElement | undefined) { triggerEl = value; },
    get focusInPanel() { return focusInPanel; },
    set focusInPanel(value: boolean) { focusInPanel = value; },
    get restoreFocusOnClose() { return restoreFocusOnClose; },
    set restoreFocusOnClose(value: boolean) { restoreFocusOnClose = value; },
    get loadMoreSentinel() { return loadMoreSentinel; },
    set loadMoreSentinel(value: HTMLButtonElement | undefined) { loadMoreSentinel = value; },
  });
}
