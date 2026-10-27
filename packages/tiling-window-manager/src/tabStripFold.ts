/** How far a tab strip has folded: every name shown, inactive tabs icon-only, or every tab icon-only. */
export type TabFold = 'full' | 'inactive-icons' | 'icons';

const FOLD_ORDER: readonly TabFold[] = ['full', 'inactive-icons', 'icons'];
/** Extra room unfolding needs, so a width on the boundary cannot flicker between two folds. */
export const FOLD_HYSTERESIS_PX = 8;

export interface TabWidths {
  /** Icon, gap and name. */
  full: number;
  /** Icon alone. */
  compact: number;
  active: boolean;
}

export interface TabFoldInput {
  /** Width the strip may fill; null when unmeasured, which keeps every name. */
  room: number | null;
  tabs: readonly TabWidths[];
  /** Room taken beside the tabs at every fold. */
  trailing: number;
  /** Width of the More tabs button; it shows only once names fold. */
  foldControl: number;
  previous: TabFold;
}

export function tabShowsName(fold: TabFold, active: boolean): boolean {
  return fold === 'full' || (fold === 'inactive-icons' && active);
}

/** The least-folded state that fits; past full folding the strip scrolls. */
export function planTabFold(input: TabFoldInput): TabFold {
  const { room } = input;
  if (room === null) return 'full';
  const previousRank = FOLD_ORDER.indexOf(input.previous);
  const fits = (fold: TabFold, rank: number): boolean => {
    const controls = input.trailing + (fold === 'full' ? 0 : input.foldControl);
    const need = input.tabs.reduce((sum, tab) => sum + (tabShowsName(fold, tab.active) ? tab.full : tab.compact), controls);
    return need + (rank < previousRank ? FOLD_HYSTERESIS_PX : 0) <= room;
  };
  return FOLD_ORDER.find(fits) ?? 'icons';
}
