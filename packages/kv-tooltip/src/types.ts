import type { JSX } from 'solid-js';
import type { KvTooltipAnchoringProps } from './TooltipContent';

// ── Wrapper mode: hover-triggered ──────────────────────────────────────────
export interface KvTooltipProps extends KvTooltipAnchoringProps {
  entries: Record<string, string>;
  children: JSX.Element;

  /** Built once per show, owned by the tooltip, and disposed on hide; never read while hidden. */
  extraContent?: JSX.Element;

  showEmpty?: boolean;
  disabled?: boolean;
  mouseOffsetX?: number;
  mouseOffsetY?: number;
  hysteresisPx?: number;
  edgePadPx?: number;
  interactive?: boolean;

  minWidth?: number | string;
  maxWidth?: number | string;

  /**
   * Interactive-mode hide debounce (ms), so the pointer can cross the trigger–panel gap;
   * re-entering either cancels. Default 100 (derived in `_internal/hoverIntent.ts`).
   */
  hideDelayMs?: number;

  /**
   * Rest delay (ms) before showing, so a pointer sweeping through dense triggers flashes nothing.
   * Default 0; no derived default, since it depends on trigger density.
   */
  showDelayMs?: number;

  /**
   * Hold entries, cursor point and anchor rect from show until hide, so live sources don't
   * twitch the panel. `extraContent` stays live; resize/scroll still re-clamp. Default `false`.
   */
  freezeOnShow?: boolean;

  /**
   * Pointerdown on the trigger hides and suppresses re-show until the pointer leaves and
   * returns, so a pending `showDelayMs` can't paint over what the click opened. Default `false`.
   */
  hideOnPointerDown?: boolean;

  /**
   * Don't show while a non-tooltip popover is open. Covers the degraded no-top-layer path and
   * deliberate deference. Default `false`: the check is document-global and would break
   * tooltips inside popovers.
   */
  suppressWhileTopLayerOpen?: boolean;

  /**
   * Hide on any scroll: a fixed panel otherwise strands beside a row that moved. Position
   * re-derives on scroll regardless; use this when the content goes stale. Default `false`.
   */
  hideOnScroll?: boolean;

  ariaLabel?: string;
  role?: 'tooltip' | 'status';

  /**
   * Screen-reader text, via `aria-describedby` (the portalled panel is unreachable). Defaults
   * to "key: value" pairs; `extraContent`-only tooltips MUST pass it or stay mouse-only.
   */
  description?: string;
  /**
   * `false` opts out of the accessible-description machinery (0.2.x mouse-only). On by
   * default: an opt-in a11y contract gets forgotten.
   */
  describeTrigger?: boolean;
  /**
   * Wrapper `tabindex="0"`. Default AUTO: focusable only when it contains no focusable
   * element, so a wrapped control keeps one tab stop.
   */
  focusable?: boolean;

  /**
   * Wrapper layout: `text` (inline, ellipsis), `control` (inline-flex, no clipping), `block`
   * (fills a table cell; move cell padding here), `contents` (boxless; child must be
   * focusable, never anchor to the wrapper).
   */
  wrapperLayout?: 'text' | 'control' | 'contents' | 'block';

  class?: string;
  panelClass?: string;
  portalTarget?: HTMLElement;
}

