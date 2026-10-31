import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import { For, Show, type Accessor, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { createChipOptions } from './createChipOptions';
import type { ChipFlyoutProps } from './types';

export const DEFAULT_PANEL_MIN = 280;
const DEFAULT_PANEL_MAX = 480;

interface ChipFlyoutViewState extends ReturnType<typeof createChipOptions> {
  open: Accessor<boolean>;
  toggle: () => void;
  panelShown: Accessor<boolean>;
  pos: Accessor<{ top: number; left: number } | null>;
  topSlot: Accessor<JSX.Element>;
  closePanel: (restoreFocus?: boolean) => void;
  panelEl: HTMLDivElement | undefined;
  triggerEl: HTMLButtonElement | undefined;
  focusInPanel: boolean;
  restoreFocusOnClose: boolean;
  loadMoreSentinel: HTMLButtonElement | undefined;
}

export function renderChipFlyout(props: ChipFlyoutProps, state: ChipFlyoutViewState): JSX.Element {
  return (
    <>
      <button
        ref={(el) => (state.triggerEl = el)}
        type="button"
        class={`cujuju-cf-trigger${
          state.open() ? ' cujuju-cf-trigger--active' : ''
        }`}
        disabled={props.disabled}
        aria-expanded={state.open()}
        aria-haspopup="dialog"
        onClick={state.toggle}
      >
        <span>{props.label}</span>
        <Show when={state.counts().included > 0}>
          <span class="cujuju-cf-badge cujuju-cf-badge--included">
            +{state.counts().included}
          </span>
        </Show>
        <Show when={state.counts().excluded > 0}>
          <span class="cujuju-cf-badge cujuju-cf-badge--excluded">
            −{state.counts().excluded}
          </span>
        </Show>
      </button>

      <Show when={state.panelShown()}>
        <Portal>
          <GlassMenu
            ref={(el) => (state.panelEl = el)}
            class="cujuju-cf-panel"
            style={{
              top: `${state.pos()!.top}px`,
              left: `${state.pos()!.left}px`,
              'min-width': `${props.panelMinWidth ?? DEFAULT_PANEL_MIN}px`,
              'max-width': `${props.panelMaxWidth ?? DEFAULT_PANEL_MAX}px`,
            }}
            role="dialog"
            tabIndex={-1}
            onFocusIn={() => {
              state.focusInPanel = true;
              state.restoreFocusOnClose = true;
            }}
            onFocusOut={(e) => {
              if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) {
                state.focusInPanel = false;
              }
            }}
            aria-label={`${props.panelTitle ?? props.label} filter`}
            title={props.panelTitle ?? props.label}
            headerAction={
              <Show when={state.counts().included > 0 || state.counts().excluded > 0}>
                <button
                  type="button"
                  class="cujuju-cf-clear"
                  onClick={state.clearAll}
                >
                  Clear
                </button>
              </Show>
            }
            onClose={() => state.closePanel()}
          >
            <div class="cujuju-cf-body">
              <Show when={state.tabs().length > 0}>
                <div
                  class="cujuju-cf-tabs"
                  role="tablist"
                  aria-label={`${props.panelTitle ?? props.label} tabs`}
                >
                  <For each={state.tabs()}>
                    {(tab, i) => (
                      <button
                        ref={(el) => state.tabEls.set(tab, el)}
                        type="button"
                        role="tab"
                        id={state.tabDomId(i())}
                        aria-controls={state.panelDomId}
                        class={`cujuju-cf-tab${
                          tab.id === state.activeTabId() ? ' cujuju-cf-tab--active' : ''
                        }`}
                        aria-selected={tab.id === state.activeTabId()}
                        tabIndex={tab.id === state.activeTabId() ? 0 : -1}
                        onClick={() => props.onTabChange?.(tab.id)}
                        onKeyDown={(e) => state.onTabKeyDown(e, i())}
                      >
                        {tab.label}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={state.topSlot()}>{state.topSlot()}</Show>
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
                id={state.panelDomId}
                role={state.tabs().length > 0 ? 'tabpanel' : undefined}
                aria-labelledby={
                  state.tabs().length > 0
                    ? state.tabDomId(state.tabs().findIndex((t) => t.id === state.activeTabId()))
                    : undefined
                }
              >
                <Show
                  when={state.grouped()}
                  fallback={
                    <div class="cujuju-cf-chips">
                      <For each={state.hoistNonNeutral(state.sortedOptions())}>{state.renderChip}</For>
                    </div>
                  }
                >
                  <For each={state.grouped()!}>
                    {([groupLabel, opts]) => (
                      <>
                        <Show when={groupLabel}>
                          <div class="cujuju-cf-group-header">
                            {groupLabel.charAt(0).toUpperCase() +
                              groupLabel.slice(1)}
                          </div>
                        </Show>
                        <div class="cujuju-cf-chips">
                          <For each={state.hoistNonNeutral(opts)}>{state.renderChip}</For>
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
                  state.sortedOptions().length === 0
                }
              >
                <div class="cujuju-cf-status">No matches.</div>
              </Show>
              {/* Scrolling to this button loads the next page; the button stays for keyboard users. */}
              <Show when={props.hasMore && props.onLoadMore && !props.loading}>
                <button
                  ref={(el) => (state.loadMoreSentinel = el)}
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
