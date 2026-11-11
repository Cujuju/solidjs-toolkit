import { createContext, type Accessor, type Setter } from 'solid-js';

/** Surface shared by a menu and its submenus: glass (default) or an opaque card. */
export type ContextMenuSurface = 'glass' | 'solid';

export interface SubmenuMenuOptions {
  onClose: () => void;
  parentMenuRef: () => HTMLElement | null;
  surface?: ContextMenuSurface;
  promoteAncestors?: () => void;
}

export interface SubmenuScope {
  menu: SubmenuMenuOptions;
  activeSubmenu: Accessor<symbol | undefined>;
  setActiveSubmenu: Setter<symbol | undefined>;
}

export const CustomSubmenuScope = createContext<SubmenuScope>();
