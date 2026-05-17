import type { JSX } from 'solid-js';

/**
 * A plain action row. Clicking it runs `onClick` and (unless
 * `keepOpen`) closes the menu.
 */
export interface ContextMenuItem {
  label: string | JSX.Element;
  onClick: () => void;
  /** Render the label in the danger color. */
  danger?: boolean;
  disabled?: boolean;
  /** Leading icon. A node, or a function (re-evaluated each render so
   *  the icon can react to state). */
  icon?: JSX.Element | (() => JSX.Element | undefined);
  /** Keep the menu open after the click instead of closing it. */
  keepOpen?: boolean;
  /** When present and returning false, the row is not rendered. */
  when?: () => boolean;
  /** When defined, renders a checkbox-style state indicator on the
   *  right side of the row — a checkmark when `true`, a reserved blank
   *  of the same width when `false`. Lets a stable-label toggle item
   *  replace a flip-label ("Stack" / "Unstack") pattern: the action
   *  label stays constant and the checkmark communicates state.
   *  Undefined means no indicator (plain action item). */
  checked?: boolean;
}

/** A horizontal rule between entries. */
export interface ContextMenuDivider {
  divider: true;
}

/** A labelled range slider embedded as a menu row. */
export interface ContextMenuSlider {
  slider: true;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: () => number;
  onChange: (value: number) => void;
  /** Unit suffix shown after the value, e.g. `'%'`. */
  unit?: string;
  when?: () => boolean;
}

/** A row that opens a nested submenu on hover. */
export interface ContextMenuSubmenu {
  submenu: true;
  label: string;
  icon?: JSX.Element;
  children: ContextMenuEntry[];
  /** When true, the submenu caps its height and shows a search field
   *  that filters its children by label. */
  scrollable?: boolean;
}

/** A row of compact side-by-side buttons (e.g. a chapter-nav cluster). */
export interface ContextMenuButtonRow {
  row: true;
  buttons: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: JSX.Element;
  }>;
}

/** Any entry the menu can render. */
export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuDivider
  | ContextMenuSlider
  | ContextMenuSubmenu
  | ContextMenuButtonRow;

export function isDivider(item: ContextMenuEntry): item is ContextMenuDivider {
  return 'divider' in item && (item as ContextMenuDivider).divider === true;
}

export function isSlider(item: ContextMenuEntry): item is ContextMenuSlider {
  return 'slider' in item && (item as ContextMenuSlider).slider === true;
}

export function isSubmenu(item: ContextMenuEntry): item is ContextMenuSubmenu {
  return 'submenu' in item && (item as ContextMenuSubmenu).submenu === true;
}

export function isButtonRow(item: ContextMenuEntry): item is ContextMenuButtonRow {
  return 'row' in item && (item as ContextMenuButtonRow).row === true;
}
