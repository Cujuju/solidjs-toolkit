import { type JSX } from 'solid-js';
import {
  type AccordionAppearance,
  type AccordionGroupApi,
  type AccordionMode,
  type AccordionOpenPlacement,
  type AccordionOrientation,
  type AccordionPolicy,
  type AccordionRailSide,
} from './context';

export interface AccordionGroupProps {
  children: JSX.Element;

  /** See `AccordionOrientation`. Default `vertical`. */
  orientation?: AccordionOrientation;
  /** See `AccordionRailSide`. `horizontal` only; ignored otherwise. Default `left`. */
  railSide?: AccordionRailSide;
  /** See `AccordionMode`. Default `natural` — the non-surprising one. */
  mode?: AccordionMode;
  /** See `AccordionAppearance`. Default `flush` — the look this control has
   *  always had, so an existing consumer that says nothing renders unchanged. */
  appearance?: AccordionAppearance;
  /** See `AccordionPolicy`. Default `single` — the accordion behaviour. */
  policy?: AccordionPolicy;
  /** See `AccordionOpenPlacement`. Default `in-order` — a stable rail. */
  openPlacement?: AccordionOpenPlacement;

  /** Drag a rail button (or a vertical header) to reorder the panels. Default true.
   *  Alt+Up/Alt+Down does the same thing from the keyboard, always. */
  reorderable?: boolean;
  /** Show splitters between adjacent open panels. Default true. */
  resizable?: boolean;

  /** Cap on simultaneously open panels. Opening past it evicts the least recently
   *  opened UNPINNED panel. Leaves and pinned panels never count as victims — see
   *  `evictForCap`. Omit for no cap. */
  maxOpen?: number;

  /**
   * Unpinned panels open as a transient OVERLAY anchored to their rail button; pinning
   * promotes one to a real column. `horizontal` only. Default false.
   */
  autoHide?: boolean;

  /**
   * The rail is the BOUNDARY between pinned columns and everything still dynamic. Defaults to
   * `autoHide`, which already implies this layout. `horizontal` only. See DESIGN_NOTES.md
   * § src/AccordionGroup.tsx:82.
   */
  railDivider?: boolean;
  /** With `autoHide`, also open a flyout on hover. Default false — hover is
   *  unavailable to keyboard and touch, so it is an accelerator, never the only
   *  way in. */
  hoverToOpen?: boolean;
  /**
   * How long a hovered activator waits before its flyout opens, ms. Default 350, sized for the
   * horizontal RAIL. See DESIGN_NOTES.md § src/AccordionGroup.tsx:103.
   */
  hoverOpenDelayMs?: number;
  /**
   * What the rail does when its buttons do not fit: `menu` collapses the overflow into a `⋯`
   * menu, `pan` leaves them reachable by dragging.
   */
  railOverflow?: 'menu' | 'pan';

  /** Chrome scale. `compact` shrinks header/rail/padding tokens for dense docks.
   *  Surfaces as `data-density`; the whole implementation is CSS. */
  density?: 'comfortable' | 'compact';
  /** Animate columns/panels opening and closing. Surfaces as `data-animated`. */
  animated?: boolean;

  /** Persist open + pinned + order + sizes under this localStorage key. Ephemeral if
   *  omitted. NESTED groups need their OWN key — state is per-group, not per-tree. */
  storageKey?: string;

  /** Explicit group extent, any CSS length. Vertical: the group's height. Horizontal: also its
   *  height — rail and columns are full-height, and `fill` divides the WIDTH. */
  height?: string;

  class?: string;
  ariaLabel?: string;

  /** Hands the group's API to the consumer, so `collapseAll()`/`expandAll()` can be driven from OUTSIDE — `useAccordionGroup()` only reaches descendants. See DESIGN_NOTES.md § src/AccordionGroup.tsx:148. */
  apiRef?: (api: AccordionGroupApi) => void;

  /** Fires on every effective open-state change, INCLUDING the auto-collapse of a
   *  sibling — a consumer that mirrors this state needs the collapses, not just
   *  the click it caused. */
  onChange?: (id: string, open: boolean) => void;
  onPinChange?: (id: string, pinned: boolean) => void;
  onOrderChange?: (order: readonly string[]) => void;
  onTearOff?: (id: string) => void;
  onDock?: (id: string) => void;
  /** A tear-off that could not happen — a blocked popup, most often. The dock has
   *  no opinion about how a host reports that, so it does not report it itself. */
  onTearOffError?: (id: string, reason: string) => void;
  onSizeChange?: (sizes: Readonly<Record<string, number>>) => void;
}
