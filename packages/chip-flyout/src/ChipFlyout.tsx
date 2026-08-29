import {
  createSignal,
  createMemo,
  createEffect,
  on,
  For,
  Show,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  createAfterPaint,
  createOutsideScrollDismiss,
  createClickOutside,
  createEscapeKey,
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
  // Optional knobs that turn the static-options flyout into a server-
  // backed catalog typeahead. All four are independent: a caller can
  // pass `loading` alone to show a spinner over a static option set,
  // or all four together for the full catalog-flyout experience.
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
  // A controlled strip rendered above the search input, splitting one
  // option pool into caller-defined slices (e.g. one per content
  // source). The component owns no tab state — it renders `activeTab`
  // and reports clicks/arrow-keys through `onTabChange`; the caller
  // re-supplies `options` for the newly active tab. Omitted or empty
  // `tabs` renders nothing, so untabbed callers are unaffected.
  /** Tabs to render above the search input. Empty/undefined = no strip. */
  tabs?: readonly ChipFlyoutTab[];
  /** Id of the active tab. Defaults to the first tab when unset. */
  activeTab?: string;
  /** Fired with the newly selected tab id on click or arrow-key move. */
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
const VIEWPORT_MARGIN_PX = 8;

/** In `multi` mode, chips are two-state (in array <-> out of array).
 *  Override the library's default 3-cycle so clicking a multi chip
 *  toggles unselected <-> included without ever passing through
 *  `excluded`. */
function multiNextState(current: TriState): TriState {
  return current === 'unselected' ? 'included' : 'unselected';
}

/**
 * Secondary-button-sized trigger that opens a Portal'd glass menu of
 * chip options. The panel follows the trigger's viewport position via
 * `getBoundingClientRect` and closes on outside click, Escape, resize,
 * or page scroll.
 *
 * In tri-state mode, clicking a chip cycles unselected -> included ->
 * excluded -> unselected. In multi mode, clicking toggles
 * unselected <-> included.
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

  function setOpen(next: boolean) {
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
    // For bottom-end, right-align the panel to the trigger's right edge
    // by snapping the panel's left so (left + minWidth) <= right. We
    // don't know the panel's final width yet, so approximate via
    // panelMinWidth.
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

  /** Clamp the panel inside the viewport after it renders. The initial
   *  position from `computePosition` is trigger-relative and can push
   *  the panel off the right or bottom edge when the trigger is near
   *  those edges. After mount, measure the actual panel size and shift
   *  top/left so it stays fully visible with a safety margin. */
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
    if (!open() || !panelEl) return;
    afterPaint(clampToViewport);
  });

  function closePanel() {
    setOpen(false);
  }

  function toggle() {
    if (open()) closePanel();
    else openPanel();
  }

  // Dismiss triggers. `createClickOutside` is pointerdown + capture-phase
  // with opening-gesture suppression; `createEscapeKey` closes on Esc.
  // Both are gated on `open` so they cost nothing while closed.
  createClickOutside(
    contains(() => [triggerEl, panelEl]),
    () => closePanel(),
    { enabled: open },
  );
  createEscapeKey(
    (e) => {
      closePanel();
      e.stopPropagation();
    },
    { enabled: open },
  );

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

  // Re-position when the controlled `open` prop flips from false to true
  // with the trigger already rendered. Without this, a caller-driven
  // open lands the panel at its last-computed position instead of the
  // current trigger rect.
  createEffect(
    on(
      () => props.open,
      (isOpen) => {
        if (isOpen) computePosition();
      },
      { defer: true },
    ),
  );

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
  // Fully controlled: the strip renders `props.tabs` and highlights
  // `props.activeTab`, falling back to the first tab so a caller that
  // supplies tabs without a selection still shows a sensible default.
  const tabs = createMemo<readonly ChipFlyoutTab[]>(() => props.tabs ?? []);
  const activeTabId = createMemo(() => props.activeTab ?? tabs()[0]?.id);
  // Roving-tabindex targets — the strip exposes ONE tab stop, and arrow
  // keys move focus between the buttons directly.
  const tabEls: (HTMLButtonElement | undefined)[] = [];

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
    const target = list[next];
    if (!target) return;
    props.onTabChange?.(target.id);
    tabEls[next]?.focus();
  }

  function renderChip(opt: ChipOption): JSX.Element {
    const state = () => chipState(opt.value);
    // The indicator is PINNED, not inherited. A tri-state chip has three
    // states but only two are ever visible at rest, so include-vs-exclude has
    // to be legible without clicking — `glyph` puts a ✓ / ✗ in the chip and
    // makes the mode self-evident. `multi` is a plain on/off toggle, where a
    // glyph column would be noise, so it takes `tint`. Leaving these to the
    // chip's own default meant a change to that default silently removed this
    // panel's only cue that it was tri-state at all.
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

      <Show when={open() && pos()}>
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
            onClose={closePanel}
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
                        ref={(el) => (tabEls[i()] = el)}
                        type="button"
                        role="tab"
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
              <Show
                when={grouped()}
                fallback={
                  <div class="cujuju-cf-chips">
                    <For each={sortedOptions()}>{renderChip}</For>
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
                        <For each={opts}>{renderChip}</For>
                      </div>
                    </>
                  )}
                </For>
              </Show>
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
