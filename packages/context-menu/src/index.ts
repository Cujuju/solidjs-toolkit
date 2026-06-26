// Side-effect: register the menu row / submenu chrome stylesheet. The
// `.glass-menu` surface stylesheet is pulled transitively by
// `@cujuju/solidjs-glass-menu` when `ContextMenu` imports `GlassMenu`.
import './context-menu.css';

export { ContextMenu, type ContextMenuProps } from './ContextMenu';
export type { ContextMenuSurface } from './MenuEntries';
export type {
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuSlider,
  ContextMenuSubmenu,
  ContextMenuButtonRow,
  ContextMenuCustom,
  ContextMenuEntry,
} from './types';
