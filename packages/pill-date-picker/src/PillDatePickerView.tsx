import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';
import { createMemo, For, onCleanup, onMount, Show, type Accessor, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { formatDte, formatLongDate, resolveDteColor } from './_internal/dte';
import type { PopoutPosition } from './_internal/popout';
import { dateOf, NO_ACTIVE_INDEX, type createPillDateModel } from './createPillDateModel';
import { DefaultRow } from './DefaultDateRow';
import type { PillDateEntry, PillDateItemState, PillDatePickerProps, PillDateRowContext } from './types';

interface DatePickerViewState<T extends PillDateEntry> extends ReturnType<typeof createPillDateModel<T>> {
  isOpen: Accessor<boolean>;
  setOpen: (next: boolean) => void;
  isPanelOpen: Accessor<boolean>;
  close: (refocus: boolean) => void;
  commit: (index: number) => void;
  noneSelectable: Accessor<boolean>;
  place: () => boolean;
  revealActiveRow: () => void;
  popout: Accessor<PopoutPosition | null>;
  anchorEl: HTMLButtonElement | undefined;
  panelEl: HTMLDivElement | undefined;
}

export function renderPillDatePicker<T extends PillDateEntry>(
  props: PillDatePickerProps<T>, modelState: DatePickerViewState<T>,
): JSX.Element {
  // ── Collapsed pill ───────────────────────────────────────────────────
  const collapsedLabel = (): string => {
    const sel = modelState.selectedItem();
    return sel ? modelState.labelOf(dateOf(sel)) : (props.placeholder ?? 'Select');
  };

  const defaultTooltipEntries = (item: T, dte: number | null): Record<string, string> => ({
    Expires: formatLongDate(dateOf(item)),
    DTE: formatDte(dte),
  });

  /** Empty entries make KvTooltip render nothing at all — which is exactly what an unselected
   *  pill (nothing to describe) and a disabled tooltip should both do. */
  const tooltipEntries = (): Record<string, string> => {
    const sel = modelState.selectedItem();
    if (!sel) return {};
    const dte = modelState.dteOf(sel);
    return props.tooltipEntries
      ? props.tooltipEntries(sel, dte)
      : defaultTooltipEntries(sel, dte);
  };

  const onTriggerKeyDown = (e: KeyboardEvent): void => {
    if (props.disabled) return;
    // Down-arrow-to-open is the listbox convention and costs nothing; without it the ladder
    // is reachable only by Enter/Space, which reads as a button, not a picker.
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      if (modelState.isOpen()) return; // the open-effect's document handler owns these once open
      e.preventDefault();
      modelState.setOpen(true);
    }
  };

  /** The cursor's key only while a row carrying it is rendered — an IDREF to nothing is a lie. */
  const activeRowKey = (): string | null => (modelState.activeIndex() === NO_ACTIVE_INDEX ? null : modelState.activeKey());

  const trigger = (): JSX.Element => (
    <button
      ref={modelState.anchorEl}
      type="button"
      class="cpdp-pill"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={modelState.isPanelOpen()}
      aria-controls={modelState.isPanelOpen() ? modelState.panelId : undefined}
      // Points at the row the arrows are on, and only while open: a closed combobox owning a
      // descendant that is not in the document is a lie.
      aria-activedescendant={modelState.isPanelOpen() && activeRowKey() !== null ? modelState.rowId(activeRowKey()!) : undefined}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      data-empty={modelState.selectedItem() ? undefined : 'true'}
      onClick={() => {
        if (props.disabled) return;
        // Toggle, not open: a second click on the pill is the user asking to put it away.
        modelState.isOpen() ? modelState.close(false) : modelState.setOpen(true);
      }}
      onKeyDown={onTriggerKeyDown}
    >
      {collapsedLabel()}
    </button>
  );

  // ── Pop-out panel ────────────────────────────────────────────────────
  // Re-place once the panel has been laid out: the first `place()` runs before the
  // portalled panel is sized, so its measured height can be 0.
  const PanelBody = (): JSX.Element => {
    onMount(() => modelState.place());
    // Open with the selection in view, not just under the cursor.
    onMount(modelState.revealActiveRow);
    // Re-place whenever the panel's own size changes: rows arriving, a status line, a wrapped note.
    onMount(() => {
      if (!modelState.panelEl || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => modelState.place());
      observer.observe(modelState.panelEl);
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
        <Show when={props.items.length > 0 && modelState.noneSelectable()}>
          <div class="cpdp-empty" role="status">
            {props.noneSelectableMessage ?? 'Nothing selectable'}
          </div>
        </Show>
        <div
          id={modelState.panelId}
          class="cpdp-list"
          role="listbox"
          tabIndex={-1}
          aria-label={props.ariaLabel}
        >
        {/* Iterating the KEYS, not the items — see `itemKeys`. */}
        <For each={modelState.itemKeys()}>
          {(key, i) => {
            /** Look up the current item by key: rows outlive an items array. The fallback covers reconciliation before departing rows are disposed. */
            let lastItem = modelState.itemByKey().get(key)!;
            const item = (): T => {
              const fresh = modelState.itemByKey().get(key);
              if (fresh !== undefined) lastItem = fresh;
              return lastItem;
            };
            const iso = (): string => dateOf(item());
            /**
             * MEMOIZED, both: every context field is read at least once per pass and
             * `dte` three times, each read parsing the ISO date and allocating a `Date`.
             */
            const dte = createMemo<number | null>(() => modelState.dteOf(item()));
            const label = createMemo<string>(() => modelState.labelOf(iso()));
            // Compare on the KEY, not the date. With two same-date contracts in the ladder
            // (SPX / SPXW), a date comparison would light up BOTH rows as selected.
            const selected = (): boolean => props.value === key;
            const state = (): PillDateItemState => modelState.stateByKey().get(key) ?? 'available';
            /**
             * Compare KEYS, not indices: `activeIndex` scans the ladder, so asking it per
             * row turns a cursor move into an O(n²) sweep. The key comparison is O(1).
             */
            const isActive = (): boolean => modelState.activeKey() === key;
            const note = (): string | undefined => props.annotation?.(item());
            /** One context object per row, with getters: custom renderers run once, so plain values would freeze. The built-in row reads the same values. */
            const ctx: PillDateRowContext<T> = {
              get item() { return item(); },
              get index() { return i(); },
              get date() { return iso(); },
              get label() { return label(); },
              get dte() { return dte(); },
              get dteLabel() { return formatDte(dte()); },
              get dteColor() {
                return state() === 'disabled' ? undefined : resolveDteColor(dte(), modelState.ramp());
              },
              get state() { return state(); },
              get annotation() { return note(); },
              get selected() { return selected(); },
              get active() { return isActive(); },
            };
            return (
              <div
                id={modelState.rowId(key)}
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
                  if (state() !== 'disabled') modelState.setActiveIndex(i());
                }}
                onClick={() => modelState.commit(i())}
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
    <div class={`cpdp-root cpdp-size-${modelState.size()} ${props.class ?? ''}`.trim()}>
      {/* The pill shows ONLY the date; the tooltip carries the DTE and is suppressed
                while open. Always mounted: a `<Show>`'s branches would both claim `anchorEl`. */}
      <KvTooltip
        entries={tooltipEntries()}
        disabled={(props.disableTooltip ?? false) || modelState.isPanelOpen()}
        class="cpdp-trigger-wrap"
      >
        {trigger()}
      </KvTooltip>

      {/* `!props.disabled` as well as `isOpen()`: a controlled parent owns the open
                flag, so disabling can only ASK it to close. Rendering is ours even when the
                open state is not. */}
      <Show when={modelState.isPanelOpen()}>
        <Portal>
          {/* The positioned scrolling shell has no role. Status messages sit beside the listbox, whose children are options. */}
          <div
            ref={modelState.panelEl}
            class={`cpdp-popout cpdp-size-${modelState.size()}`}
            data-placement={modelState.popout()?.placement}
            style={{
              position: 'fixed',
              top: `${modelState.popout()?.top ?? 0}px`,
              left: `${modelState.popout()?.left ?? 0}px`,
              // Until the first measurement lands, the panel would otherwise paint at 0,0 for
              // one frame — a flash in the top-left corner of the screen.
              visibility: modelState.popout() ? 'visible' : 'hidden',
            }}
          >
            <PanelBody />
          </div>
        </Portal>
      </Show>
    </div>
  );
}
