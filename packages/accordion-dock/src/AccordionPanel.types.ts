import type { JSX } from 'solid-js';
import type { AccordionDefaultSize } from './contentSize';
import type { PanelBadge } from './context';

export interface AccordionPanelProps {
  /** Stable identity within the group — the key for open/pinned/order/size state. Must be
   *  unique among siblings; NOT auto-generated, which would break persistence on remount. */
  id: string;
  title: string | JSX.Element;
  children: JSX.Element;

  /** Trailing count badge, e.g. `Errors (3)`. */
  count?: number;
  /** State dot on the rail button and header — "needs attention", no number. */
  badge?: PanelBadge;
  /** Leading glyph. Shown in the vertical header AND on the rail button. */
  icon?: JSX.Element;
  /** Shorter label for the rail button, when the full title is too long rotated. */
  railLabel?: string | JSX.Element;
  /** Native tooltip on the activator. */
  tooltip?: string;
  /** Right-aligned controls in the panel's own header/title bar. Clicks do NOT toggle. */
  actions?: JSX.Element;

  /** Open on first render, unless a layout was restored (storageKey or `setLayout`). */
  defaultOpen?: boolean;
  /** Set false for a panel that must always obey the accordion. Default true. */
  pinnable?: boolean;
  /** Show a close (×) on the panel's title bar. Default: true in `horizontal`, false in
   *  `vertical`, where the header itself toggles. */
  closable?: boolean;

  /** Per-panel accent colour — recolours the rail marker, pin and focus ring for
   *  this panel only. Any CSS colour; sets `--acc-accent` on the panel's subtree. */
  accent?: string;
  /** Floor for interactive resize, px. */
  minSize?: number;
  /**
   * This panel absorbs the group's leftover extent in `fill` mode. With no declaration the job
   * falls to the TRAILING member. See DESIGN_NOTES.md § src/AccordionPanel.tsx:62.
   */
  grow?: boolean;
  /**
   * This panel is never larger than its own content: its size becomes a CEILING. Overrides
   * `grow`. See DESIGN_NOTES.md § src/AccordionPanel.tsx:79.
   */
  shrinkToContent?: boolean;
  /** Initial size along the growth axis, px — or `'content'` to measure and freeze what the
   *  panel first holds. A user's drag always wins over it. */
  defaultSize?: AccordionDefaultSize;

  /** Skip rendering children until first opened — for expensive content. */
  lazyMount?: boolean;
  /** Offer the pop-out-to-a-window affordance. Default false: a panel whose content assumes it
   *  shares a document with the dock should not advertise it. */
  tearOffable?: boolean;

  class?: string;
  headerClass?: string;
  contentClass?: string;
  railClass?: string;
  style?: JSX.CSSProperties;
}
