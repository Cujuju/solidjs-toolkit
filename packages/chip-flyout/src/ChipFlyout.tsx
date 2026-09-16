import {
  createSignal,
  createMemo,
  createEffect,
  createUniqueId,
  on,
  untrack,
  For,
  Show,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  createAfterPaint,
  createOutsideScrollDismiss,
  createClickOutside,
  createEscapeOwner,
  contains,
} from '@cujuju/solidjs-hooks';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import {
  TriStateChip,
  applyTriState,
  tristateOf,
  EMPTY_TRI_STATE,
  type TriState,
  type TriStateValue,
} from '@cujuju/solidjs-tri-state-chip';
import { safeAddEventListener, getGlobalTarget } from './_internal/safeEvent';

/** One chip option. `group` is optional; options sharing a group value
 *  render under a single header in the panel. */
export interface ChipOption {
  value: string;
  label: string;
  group?: string;
}

/** One tab in the panel's optional tab strip. `id` is the value echoed
 *  back through `onTabChange`; `label` is the visible text. */
export interface ChipFlyoutTab {
  id: string;
  label: string;
}

interface BaseProps {
  /** Label shown on the trigger button and as the panel header (unless
   *  `panelTitle` is set). */
  label: string;
  options: ChipOption[];
  /** Overrides the panel header text. */
  panelTitle?: string;
  /** Sort options alphabetically before rendering. Groups still obey
   *  this sort within each group. */
  sort?: boolean;
  disabled?: boolean;
  placement?: 'bottom-start' | 'bottom-end';
  panelMinWidth?: number;
  panelMaxWidth?: number;
  /** Optional controlled open state. If provided, the caller owns
   *  open/close transitions; if omitted, the component manages its own
   *  state internally. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  // ── Async / typeahead extensions ─────────────────────────────────
  // Independent knobs: `loading` alone shows a spinner over static options; all
  // four together make a server-backed catalog typeahead.
  /** Show a small "Loading…" hint inside the panel body. */
  loading?: boolean;
  /** When true, the "Load more" sentinel renders below the chips. */
  hasMore?: boolean;
  /** Caller-supplied page advance. Invoked on the "Load more" click. */
  onLoadMore?: () => void;
  /** Controlled search-input value. When provided, a search `<input>`
   *  renders at the top of the panel. */
  searchValue?: string;
  /** Search-input change handler. The caller is responsible for
   *  debouncing — the input emits keystroke-rate events. */
  onSearchInput?: (next: string) => void;
  /** Optional JSX rendered between the header and the search input. */
  topSlot?: JSX.Element;
  // ── Tab strip ─────────────────────────────────────────
  // Controlled: renders `activeTab` and reports clicks/arrows through
  // `onTabChange`; the caller re-supplies `options` for the new tab. No `tabs`
  // renders nothing.
  /** Tabs to render above the search input. Empty/undefined = no strip. */
  tabs?: readonly ChipFlyoutTab[];
  /** Id of the active tab. Defaults to the first tab when unset, and when it names a tab that
   *  isn't in `tabs`, so a shrinking list can't leave nothing selected. */
  activeTab?: string;
  /** Fired with the selected tab id. MANUAL activation: a click, or
   *  Enter/Space on a focused tab. Arrow keys only move focus. */
  onTabChange?: (id: string) => void;
}

interface TriStateProps extends BaseProps {
  mode: 'tri-state';
  value: TriStateValue;
  onChange: (next: TriStateValue) => void;
}

interface MultiProps extends BaseProps {
  mode: 'multi';
  value: string[];
  onChange: (next: string[]) => void;
}

export type ChipFlyoutProps = TriStateProps | MultiProps;

const DEFAULT_PANEL_MIN = 280;
const DEFAULT_PANEL_MAX = 480;
const PANEL_OFFSET_PX = 4;
/** Minimum gap the panel keeps from any viewport edge when clamped. */
export const VIEWPORT_MARGIN_PX = 8;
/** Touch-first devices, where focusing a text input raises the soft keyboard. */
const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** In `multi` mode, chips are two-state (in array <-> out of array).
 *  Override the library's default 3-cycle so clicking a multi chip
 *  toggles unselected <-> included without ever passing through
 *  `excluded`. */
function multiNextState(current: TriState): TriState {
  return current === 'unselected' ? 'included' : 'unselected';
}

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

  function chipState(value: string): TriState {
    if (props.mode === 'tri-state') {
      return tristateOf(props.value, value);
    }
    return props.value.includes(value) ? 'included' : 'unselected';
  }

  function clearAll() {
    if (props.mode === 'tri-state') {
      props.onChange({ ...EMPTY_TRI_STATE });
    } else {
      props.onChange([]);
    }
  }

  function onChipCycle(value: string, next: TriState) {
    if (props.mode === 'tri-state') {
      props.onChange(applyTriState(props.value, value, next));
    } else {
      // Multi: chip only emits 'included' or 'unselected' because we
      // pass a 2-state `nextState`. Mirror that into the string[] shape.
      if (next === 'included') {
        if (!props.value.includes(value)) {
          props.onChange([...props.value, value]);
        }
      } else {
        props.onChange(props.value.filter((x) => x !== value));
      }
    }
  }

  const counts = createMemo(() => {
    if (props.mode === 'tri-state') {
      return {
        included: props.value.included.length,
        excluded: props.value.excluded.length,
      };
    }
    return { included: props.value.length, excluded: 0 };
  });

  function computePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const placement = props.placement ?? 'bottom-start';
    const top = rect.bottom + PANEL_OFFSET_PX;
    // For bottom-end, right-align to the trigger's right edge by snapping left so
    // (left + minWidth) <= right; the panel's final width isn't known yet.
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

  /** Clamp the panel inside the viewport after it renders: the trigger-relative position from
   *  `computePosition` can push it off the right or bottom edge. */
  function clampToViewport(): void {
    if (!panelEl || !triggerEl) return;
    const panel = panelEl.getBoundingClientRect();
    const triggerRect = triggerEl.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    const current = pos();
    if (!current) return;
    let { top, left } = current;

    // Horizontal: if the panel's right edge overflows, slide it
    // leftward so it fits; never let its left go below the margin.
    const rightEdge = left + panel.width;
    if (rightEdge > vpW - VIEWPORT_MARGIN_PX) {
      left = Math.max(
        VIEWPORT_MARGIN_PX,
        vpW - panel.width - VIEWPORT_MARGIN_PX,
      );
    }
    if (left < VIEWPORT_MARGIN_PX) left = VIEWPORT_MARGIN_PX;

    // Vertical: if the panel overflows the bottom, flip above the
    // trigger. If it ALSO doesn't fit above (tiny viewport), snap to
    // the top margin.
    const bottomEdge = top + panel.height;
    if (bottomEdge > vpH - VIEWPORT_MARGIN_PX) {
      const flipped = triggerRect.top - panel.height - PANEL_OFFSET_PX;
      top = flipped >= VIEWPORT_MARGIN_PX ? flipped : VIEWPORT_MARGIN_PX;
    }

    if (top !== current.top || left !== current.left) {
      setPos({ top, left });
    }
  }

  // Run the clamp once the panel has painted at its initial position.
  // `afterPaint` waits for the first layout pass so
  // `panelEl.getBoundingClientRect` reflects the real rendered size.
  createEffect(() => {
    if (!panelShown() || !panelEl) return;
    afterPaint(clampToViewport);
  });

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

  // Values non-neutral (enabled or disabled) when the panel opened. Snapshotted, not live,
  // so a toggled chip never moves under the pointer; the next open re-sorts.
  const nonNeutralAtOpen = createMemo(
    on(panelShown, (shown) => {
      if (!shown) return null;
      return new Set(
        props.mode === 'tri-state'
          ? [...props.value.included, ...props.value.excluded]
          : props.value,
      );
    }),
  );

  /** Stable partition: chips non-neutral at open first; both runs keep their incoming order. */
  function hoistNonNeutral(opts: ChipOption[]): ChipOption[] {
    const hoisted = nonNeutralAtOpen();
    if (!hoisted || hoisted.size === 0) return opts;
    return [
      ...opts.filter((o) => hoisted.has(o.value)),
      ...opts.filter((o) => !hoisted.has(o.value)),
    ];
  }

  const sortedOptions = createMemo(() =>
    props.sort
      ? [...props.options].sort((a, b) => a.label.localeCompare(b.label))
      : props.options,
  );

  // Produces ordered [groupLabel, options][] when any option has a
  // group; returns null for flat (ungrouped) option sets.
  const grouped = createMemo(() => {
    const opts = sortedOptions();
    if (!opts.some((o) => o.group)) return null;
    const m = new Map<string, ChipOption[]>();
    for (const opt of opts) {
      const key = opt.group ?? '';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(opt);
    }
    return [...m.entries()];
  });

  // ── Tab strip ───────────────────────────────────────────────────
  // Fully controlled: renders `props.tabs`, highlighting `props.activeTab` and
  // falling back to the first tab.
  const tabs = createMemo<readonly ChipFlyoutTab[]>(() => props.tabs ?? []);
  // `activeTab` is VALIDATED, not trusted: an async-fed caller can pass an id that has
  // vanished, which would leave every button `aria-selected=false` and `tabindex=-1` —
  // unreachable by keyboard.
  const activeTabId = createMemo(() => {
    const list = tabs();
    const wanted = props.activeTab;
    return wanted !== undefined && list.some((t) => t.id === wanted)
      ? wanted
      : list[0]?.id;
  });
  // One tab stop; arrows move focus directly. Keyed by tab object, as `For` is — a
  // creation-time index goes stale when `tabs` changes.
  const tabEls = new WeakMap<ChipFlyoutTab, HTMLButtonElement>();
  // Stable id base for the tab <-> tabpanel `aria-controls` /
  // `aria-labelledby` pairing. Per instance, so two flyouts on one page
  // never collide.
  const uid = createUniqueId();
  const tabDomId = (i: number) => `${uid}-tab-${i}`;
  const panelDomId = `${uid}-tabpanel`;

  /** MANUAL activation (WAI-ARIA APG): arrows/Home/End move FOCUS only. Automatic activation
   *  would re-query per keypress for a catalog-backed caller. Enter/Space arrives as a native
   *  button click. */
  function onTabKeyDown(e: KeyboardEvent, index: number): void {
    const list = tabs();
    if (list.length === 0) return;
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault();
    tabEls.get(list[next]!)?.focus();
  }

  function renderChip(opt: ChipOption): JSX.Element {
    const state = () => chipState(opt.value);
    // PINNED, not inherited: tri-state needs `glyph` so include-vs-exclude reads at rest,
    // `multi` takes `tint`. Inheriting let a default change silently remove the cue.
    return (
      <TriStateChip
        label={opt.label}
        value={state()}
        indicator={props.mode === 'multi' ? 'tint' : 'glyph'}
        nextState={props.mode === 'multi' ? multiNextState : undefined}
        onCycle={(next) => onChipCycle(opt.value, next)}
      />
    );
  }

  return (
    <>
      <button
        ref={(el) => (triggerEl = el)}
        type="button"
        class={`cujuju-cf-trigger${
          open() ? ' cujuju-cf-trigger--active' : ''
        }`}
        disabled={props.disabled}
        aria-expanded={open()}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <span>{props.label}</span>
        <Show when={counts().included > 0}>
          <span class="cujuju-cf-badge cujuju-cf-badge--included">
            +{counts().included}
          </span>
        </Show>
        <Show when={counts().excluded > 0}>
          <span class="cujuju-cf-badge cujuju-cf-badge--excluded">
            −{counts().excluded}
          </span>
        </Show>
      </button>

      <Show when={panelShown()}>
        <Portal>
          <GlassMenu
            ref={(el) => (panelEl = el)}
            class="cujuju-cf-panel"
            style={{
              top: `${pos()!.top}px`,
              left: `${pos()!.left}px`,
              'min-width': `${props.panelMinWidth ?? DEFAULT_PANEL_MIN}px`,
              'max-width': `${props.panelMaxWidth ?? DEFAULT_PANEL_MAX}px`,
            }}
            role="dialog"
            tabIndex={-1}
            onFocusIn={() => {
              focusInPanel = true;
              restoreFocusOnClose = true;
            }}
            onFocusOut={(e) => {
              if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) {
                focusInPanel = false;
              }
            }}
            aria-label={`${props.panelTitle ?? props.label} filter`}
            title={props.panelTitle ?? props.label}
            headerAction={
              <Show when={counts().included > 0 || counts().excluded > 0}>
                <button
                  type="button"
                  class="cujuju-cf-clear"
                  onClick={clearAll}
                >
                  Clear
                </button>
              </Show>
            }
            onClose={() => closePanel()}
          >
            <div class="cujuju-cf-body">
              <Show when={tabs().length > 0}>
                <div
                  class="cujuju-cf-tabs"
                  role="tablist"
                  aria-label={`${props.panelTitle ?? props.label} tabs`}
                >
                  <For each={tabs()}>
                    {(tab, i) => (
                      <button
                        ref={(el) => tabEls.set(tab, el)}
                        type="button"
                        role="tab"
                        id={tabDomId(i())}
                        aria-controls={panelDomId}
                        class={`cujuju-cf-tab${
                          tab.id === activeTabId() ? ' cujuju-cf-tab--active' : ''
                        }`}
                        aria-selected={tab.id === activeTabId()}
                        tabIndex={tab.id === activeTabId() ? 0 : -1}
                        onClick={() => props.onTabChange?.(tab.id)}
                        onKeyDown={(e) => onTabKeyDown(e, i())}
                      >
                        {tab.label}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={props.topSlot}>{props.topSlot}</Show>
              <Show when={props.onSearchInput !== undefined}>
                <input
                  type="search"
                  class="cujuju-cf-search"
                  value={props.searchValue ?? ''}
                  onInput={(e) =>
                    props.onSearchInput?.(e.currentTarget.value)
                  }
                  placeholder="Search…"
                  aria-label={`Search ${props.panelTitle ?? props.label}`}
                />
              </Show>
              {/* The option list is what a tab controls, so it carries the `tabpanel`
                                role and points back at the active tab. Rendered unconditionally,
                                styled as the body's flex column. */}
              <div
                class="cujuju-cf-tabpanel"
                id={panelDomId}
                role={tabs().length > 0 ? 'tabpanel' : undefined}
                aria-labelledby={
                  tabs().length > 0
                    ? tabDomId(tabs().findIndex((t) => t.id === activeTabId()))
                    : undefined
                }
              >
                <Show
                  when={grouped()}
                  fallback={
                    <div class="cujuju-cf-chips">
                      <For each={hoistNonNeutral(sortedOptions())}>{renderChip}</For>
                    </div>
                  }
                >
                  <For each={grouped()!}>
                    {([groupLabel, opts]) => (
                      <>
                        <Show when={groupLabel}>
                          <div class="cujuju-cf-group-header">
                            {groupLabel.charAt(0).toUpperCase() +
                              groupLabel.slice(1)}
                          </div>
                        </Show>
                        <div class="cujuju-cf-chips">
                          <For each={hoistNonNeutral(opts)}>{renderChip}</For>
                        </div>
                      </>
                    )}
                  </For>
                </Show>
              </div>
              <Show when={props.loading}>
                <div class="cujuju-cf-status" aria-live="polite">
                  Loading…
                </div>
              </Show>
              <Show
                when={
                  !props.loading &&
                  props.onSearchInput !== undefined &&
                  sortedOptions().length === 0
                }
              >
                <div class="cujuju-cf-status">No matches.</div>
              </Show>
              <Show when={props.hasMore && props.onLoadMore && !props.loading}>
                <button
                  type="button"
                  class="cujuju-cf-load-more"
                  onClick={() => props.onLoadMore?.()}
                >
                  Load more
                </button>
              </Show>
            </div>
          </GlassMenu>
        </Portal>
      </Show>
    </>
  );
}
