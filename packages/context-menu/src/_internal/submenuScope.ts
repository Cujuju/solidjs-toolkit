import { createContext, type Accessor, type Setter } from 'solid-js';
import type { AimLock } from './submenuAim.js';

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
  /** Hover opens route through this, so a submenu being aimed at is not stolen by a sibling. */
  aimLock: AimLock;
}

export const CustomSubmenuScope = createContext<SubmenuScope>();
