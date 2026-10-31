import type { Accessor, JSX } from 'solid-js';

type HTMLDivAttrs = JSX.HTMLAttributes<HTMLDivElement>;

export type AnchoredPlacement =
  | 'below-start'
  | 'below-end'
  | 'above-start'
  | 'above-end'
  | 'right-start'
  | 'right-end'
  | 'left-start'
  | 'left-end';

export interface AnchoredPopoverProps {
  /** Browser popover state is synced TO this. The consumer sets it false in response to
   *  `onDismiss`. */
  open: Accessor<boolean>;
  /** Reactive anchor; `null` skips positioning. Excluded from outside-click dismiss (clicks on
   *  it are the toggle). With `horizontalAnchor`, drives only the perpendicular axis. */
  anchor: Accessor<HTMLElement | null | undefined>;
  /** Side-axis anchor for `right`/`left` placements (ignored otherwise), e.g. a submenu's x
   *  from the parent panel, y from its trigger row. Excluded from outside-click dismiss. */
  horizontalAnchor?: Accessor<HTMLElement | null | undefined>;
  /** Parent popover re-promoted after this one shows: top-layer order is LIFO, so otherwise the
   *  child paints above its parent. No-op unless the parent is `:popover-open`. */
  parentPopoverRef?: Accessor<HTMLElement | null | undefined>;
  /** Fired on outside click (panel and anchor excluded) or Escape while open; not when the
   *  consumer sets `open` false. */
  onDismiss: () => void;
  /** Which corner of the anchor to align with. Default `below-start`
   *  (popover's top-left at anchor's bottom-left). All placements
   *  clamp into the viewport after initial positioning. */
  placement?: AnchoredPlacement;
  /** Override the default 4px gap between anchor and popover. */
  offsetPx?: number;
  /** Override the default 8px viewport-edge clamp margin. */
  viewportMarginPx?: number;
  /** Class applied to the popover CONTENT element. Consumers own
   *  visual styling (color, padding, radius, shadow, width). */
  class?: string;
  /** Passed through. Common values: `"menu"`, `"dialog"`, `"listbox"`. */
  role?: HTMLDivAttrs['role'];
  /** Passed through. Strongly recommended for screen-reader context. */
  'aria-label'?: string;
  /** Optional id forwarded to the content `<div>` (the element that
   *  carries `class` / `role` / `aria-label`). Useful when an external
   *  trigger button needs to wire `aria-controls`. */
  id?: string;
  /**
   * Fired on every open once shown AND positioned. Before that `.focus()` silently fails
   * (`display: none`, then unpositioned), and consumer refs, effects or one rAF can't reliably wait.
   */
  onShown?: () => void;
  /** Ref to the CONTENT element, for non-bubbling listeners (`pointerenter`/`pointerleave`)
   *  spanning sibling children. Not for restyling; `shellClass`'s cascade-trap warning applies. */
  contentRef?: (el: HTMLDivElement) => void;
  /** Class on the SHELL (the `popover` element), for `::backdrop` and shell-scoped variables
   *  only. Never set `display`/`visibility`: it would beat the UA's closed-state `display: none`. */
  shellClass?: string;
  /** Reactive inline styles on the SHELL, e.g. custom properties for `::backdrop`, which
   *  inherits from its popover, not `:root`. */
  shellStyle?: Accessor<Record<string, string>>;
  /** Centre horizontally in the viewport for vertical placements; vertical position still
   *  follows the anchor. */
  centered?: boolean;
  /** Outside-click dismiss is suppressed when this returns true for the target, e.g. for
   *  portalled nested surfaces: `(t) => !!t.closest('[popover]:popover-open')`. */
  shouldSuppressDismiss?: (target: Element) => boolean;
  children: JSX.Element;
}

