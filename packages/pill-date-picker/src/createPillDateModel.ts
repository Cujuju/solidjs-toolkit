import {
  createMemo,
  createSignal,
  createUniqueId,
} from 'solid-js';
import {
  daysToExpiration,
  DEFAULT_DTE_RAMP,
  formatMonthDay,
  type DteColorStop,
} from './_internal/dte';
import {
  type PillDateEntry,
  type PillDateItemState,
  type PillDatePickerProps,
} from './types';

/** The ISO date of an entry, whichever shape it arrived in. */
export function dateOf(item: PillDateEntry): string {
  return typeof item === 'string' ? item : item.date;
}

/** Nothing is active until the user navigates or a selection is found. */
export const NO_ACTIVE_INDEX = -1;

/** Bundler-agnostic dev check — `import.meta.env` exists under Vite, and the
 *  optional chain keeps this harmless anywhere it does not. */
const isDev = Boolean(
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
);

export function createPillDateModel<T extends PillDateEntry>(props: PillDatePickerProps<T>) {
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
  return { panelId, rowId, size, ramp, dteOf, labelOf, keyOf, stateByKey, stateOf, itemKeys, itemByKey, disabledAt, selectedItem, activeKey, setActiveKey, activeIndex, setActiveIndex };
}
