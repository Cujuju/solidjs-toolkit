import { type Accessor, type JSX } from 'solid-js';
import type {
  AccordionOrientation,
  AccordionPolicy,
  AccordionRailSide,
  ActivatorHoverProps,
  PanelMeta,
} from './context';

/**
 * AUTO-HIDE — an unpinned open panel renders as a flyout; pinning promotes it to a column.
 * Flyout-ness is DERIVED. See DESIGN_NOTES.md § src/autoHide.tsx:22.
 */

/** Delay before a hovered activator opens its flyout, ms. Must exceed the incidental dwell
 *  along the rail; 350ms. See DESIGN_NOTES.md § src/autoHide.tsx:100. */
export const FLYOUT_HOVER_ENTER_DELAY_MS = 350;

/** Grace after the pointer leaves the button or flyout, ms. Shorter than the enter delay:
 *  reopening is the cheaper mistake. See DESIGN_NOTES.md § src/autoHide.tsx:118. */
export const FLYOUT_HOVER_LEAVE_GRACE_MS = 260;

/** Fallback max height as a fraction of the viewport, used only when the rail cannot be
 *  measured — which means the markup contract below changed. */
export const FLYOUT_FALLBACK_MAX_HEIGHT_VH = 60;

/** Flyout width when the panel has no dragged size, px. Matches `--acc-col-width` so pinning
 *  does not resize it. */
export const FLYOUT_DEFAULT_WIDTH_PX = 230;

/**
 * The flyout's CROSS-AXIS sizing. Horizontal uses the panel's own width; vertical uses
 * `max-content`, floored at the anchor. See DESIGN_NOTES.md § src/autoHide.tsx:154.
 */
export function flyoutCrossAxis(input: {
  orientation: AccordionOrientation;
  /** The panel's stored size along the growth axis — a WIDTH only in horizontal. */
  panelSizePx: number | undefined;
  /** The group's measured width. `0` when it could not be read. */
  groupWidthPx: number;
}): { width: string; minWidth: string; maxWidth?: string } {
  if (input.orientation !== 'vertical') {
    const px = input.panelSizePx ?? FLYOUT_DEFAULT_WIDTH_PX;
    // `maxWidth: 'none'` is written explicitly: a horizontal flyout inheriting the stylesheet's
    // vertical ceiling would be capped below the width the user dragged, so pinning would resize.
    return { width: `${px}px`, minWidth: `${px}px`, maxWidth: 'none' };
  }
  const floor =
    input.groupWidthPx > 0 ? Math.round(input.groupWidthPx) : FLYOUT_DEFAULT_WIDTH_PX;
  // `maxWidth` deliberately ABSENT — the stylesheet's `--acc-flyout-max-width`
  // applies, and writing it inline here would out-rank a consumer restating it.
  return { width: 'max-content', minWidth: `${floor}px` };
}

/**
 * The group's markup contract, read (never written) to measure a flyout's max height: the
 * rail already spans exactly the dock's growth axis.
 */
export const RAIL_SELECTOR = '.acc-rail';

/** The group root, read (never written) as the source of the typography a
 *  Portal'd flyout would otherwise lose — see `inheritedTypographyOf`. */
export const GROUP_SELECTOR = '.acc-group';

/**
 * Typography a Portal'd flyout must be told, because it inherits from `<body>` rather than the
 * group. See DESIGN_NOTES.md § src/autoHide.tsx:221.
 */
export const INHERITED_TYPOGRAPHY = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
] as const;

/**
 * Read the group's resolved typography as inline style. LONGHANDS, not the `font` shorthand,
 * which serializes empty. See DESIGN_NOTES.md § src/autoHide.tsx:260.
 */
export function inheritedTypographyOf(
  groupEl: Element | null | undefined,
): Record<string, string> {
  if (groupEl === null || groupEl === undefined) return {};
  // `typeof` guarded for the jsdom/SSR case, where there is no cascade to read.
  if (typeof getComputedStyle !== 'function') return {};
  const computed = getComputedStyle(groupEl);
  const style: Record<string, string> = {};
  for (const prop of INHERITED_TYPOGRAPHY) {
    const value = computed.getPropertyValue(prop);
    if (value !== '') style[prop] = value;
  }
  return style;
}

/** Class on the popover SHELL. See DESIGN_NOTES.md § src/autoHide.tsx:287. */
export const FLYOUT_SHELL_CLASS = 'acc-flyout-shell';

/** Class on the flyout CONTENT element. All visual styling lives in
 *  `autoHide.css` against this class. */
export const FLYOUT_CONTENT_CLASS = 'acc-flyout';

/**
 * Cross-package WIRE CONTRACT from `@cujuju/solidjs-context-menu`: Portal'd submenus carry
 * `data-popover-stack`, and coexisting host popovers match the same literal attribute.
 * Duplicated, not imported — the package documents the attribute, not the symbol.
 */
export const POPOVER_STACK_SELECTOR = '[data-popover-stack]';

/**
 * Elements whose pointerdown must NOT dismiss a flyout: a right-click menu is Portal'd
 * outside it. See DESIGN_NOTES.md § src/autoHide.tsx:315.
 */
export const DISMISS_SUPPRESS_SELECTOR = `${POPOVER_STACK_SELECTOR}, [popover]:not(.${FLYOUT_SHELL_CLASS})`;

/** Why a flyout is open. See DESIGN_NOTES.md § src/autoHide.tsx:330. */
export type FlyoutOpenCause = 'hover' | 'click';

/** The slice of `AccordionGroupApi` this module consumes. See DESIGN_NOTES.md § src/autoHide.tsx:341. */
export interface AutoHideGroup {
  orientation: Accessor<AccordionOrientation>;
  railSide: Accessor<AccordionRailSide>;
  policy: Accessor<AccordionPolicy>;
  openOrder: Accessor<readonly string[]>;
  meta: (id: string) => PanelMeta | undefined;
  isOpen: (id: string) => boolean;
  isPinned: (id: string) => boolean;
  /** Promote a flyout to a docked column, or demote it back. See DESIGN_NOTES.md § src/autoHide.tsx:360. */
  togglePin: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
  sizeOf: (id: string) => number | undefined;
  /** The element representing the panel — its rail button, or the `⋯` trigger once that button collapses. See DESIGN_NOTES.md § src/autoHide.tsx:372. */
  activatorElOf: (id: string) => HTMLElement | undefined;
  /** Suppresses hover-open mid-gesture — see `onRailPointerEnter`. */
  reorderActiveId: Accessor<string | null>;
  resizing: Accessor<boolean>;
  /** OPTIONAL only so this file compiles before the group grows it. See DESIGN_NOTES.md § src/autoHide.tsx:385. */
  density?: Accessor<'comfortable' | 'compact'>;
}

export interface AutoHideOptions {
  group: AutoHideGroup;
  /** The group's `autoHide` prop. Inert in `vertical` orientation — see SCOPE. */
  enabled: Accessor<boolean>;
  /** Open a flyout on hover as well as click. Default FALSE — hover is unavailable to keyboard
   *  and touch, so it must stay an accelerator, never the only way in. */
  hoverToOpen?: Accessor<boolean>;
  /** Override for {@link FLYOUT_HOVER_ENTER_DELAY_MS}. Undefined keeps the default, which is
   *  tuned for the horizontal rail; a vertical dock wants a much smaller one. */
  hoverOpenDelayMs?: Accessor<number | undefined>;
}

export interface AutoHideApi {
  /** True when `id` should render as an overlay rather than a column. The
   *  derivation at the top of this file, and the only state question this
   *  module answers. */
  isFlyout: (id: string) => boolean;
  /** Where a flying-out panel's subtree should mount, or undefined when it belongs in its
   *  column. Consumed by `AccordionPanel`'s own Portal. */
  flyoutMountFor: (id: string) => HTMLElement | undefined;
  /** Spread on the panel's ACTIVATOR — the rail button in horizontal, the header bar in vertical. See DESIGN_NOTES.md § src/autoHide.tsx:430. */
  activatorHoverProps: (id: string) => ActivatorHoverProps;
  /** Dismiss a flyout: closes the panel and returns focus to its rail button if
   *  focus was inside. */
  dismiss: (id: string) => void;
  /** Render ONCE inside the group. Every open flyout's popover lives here. */
  element: JSX.Element;
}
