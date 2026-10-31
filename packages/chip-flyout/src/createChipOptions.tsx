import { EMPTY_TRI_STATE, TriStateChip, applyTriState, tristateOf, type TriState } from '@cujuju/solidjs-tri-state-chip';
import { createMemo, createUniqueId, on, type Accessor, type JSX } from 'solid-js';
import type { ChipFlyoutProps, ChipFlyoutTab, ChipOption } from './types';

/** Multi chips toggle between unselected and included, overriding the default three-state cycle so excluded is unreachable. */
function multiNextState(current: TriState): TriState {
  return current === 'unselected' ? 'included' : 'unselected';
}

export function createChipOptions(props: ChipFlyoutProps, panelShown: Accessor<boolean>) {
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

  return { chipState, clearAll, onChipCycle, counts, sortedOptions, grouped, tabs, activeTabId, tabEls, tabDomId, panelDomId, onTabKeyDown, hoistNonNeutral, renderChip };
}
