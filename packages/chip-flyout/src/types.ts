import type { TriStateValue } from '@cujuju/solidjs-tri-state-chip';
import type { JSX } from 'solid-js';

/** One chip option. `group` is optional; options sharing a group value
 *  render under a single header in the panel. */
export interface ChipOption {
  value: string;
  label: string;
  group?: string;
}

/** One tab in the panel's optional tab strip. `id` is the value echoed
 *  back through `onTabChange`; `label` is the visible text. */
export interface ChipFlyoutTab {
  id: string;
  label: string;
}

interface BaseProps {
  /** Label shown on the trigger button and as the panel header (unless
   *  `panelTitle` is set). */
  label: string;
  options: ChipOption[];
  /** Overrides the panel header text. */
  panelTitle?: string;
  /** Sort options alphabetically before rendering. Groups still obey
   *  this sort within each group. */
  sort?: boolean;
  disabled?: boolean;
  placement?: 'bottom-start' | 'bottom-end';
  panelMinWidth?: number;
  panelMaxWidth?: number;
  /** Optional controlled open  If provided, the caller owns
   *  open/close transitions; if omitted, the component manages its own
   *  state internally. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  // ── Async / typeahead extensions ─────────────────────────────────
  // Independent knobs: `loading` alone shows a spinner over static options; all
  // four together make a server-backed catalog typeahead.
  /** Show a small "Loading…" hint inside the panel body. */
  loading?: boolean;
  /** When true, the "Load more" sentinel renders below the chips. */
  hasMore?: boolean;
  /** Caller-supplied page advance. Invoked on the "Load more" click. */
  onLoadMore?: () => void;
  /** Controlled search-input value. When provided, a search `<input>`
   *  renders at the top of the panel. */
  searchValue?: string;
  /** Search-input change handler. The caller is responsible for
   *  debouncing — the input emits keystroke-rate events. */
  onSearchInput?: (next: string) => void;
  /** Optional JSX rendered between the header and the search input. */
  topSlot?: JSX.Element;
  // ── Tab strip ─────────────────────────────────────────
  // Controlled: renders `activeTab` and reports clicks/arrows through
  // `onTabChange`; the caller re-supplies `options` for the new tab. No `tabs`
  // renders nothing.
  /** Tabs to render above the search input. Empty/undefined = no strip. */
  tabs?: readonly ChipFlyoutTab[];
  /** Id of the active tab. Defaults to the first tab when unset, and when it names a tab that
   *  isn't in `tabs`, so a shrinking list can't leave nothing selected. */
  activeTab?: string;
  /** Fired with the selected tab id. MANUAL activation: a click, or
   *  Enter/Space on a focused tab. Arrow keys only move focus. */
  onTabChange?: (id: string) => void;
}

interface TriStateProps extends BaseProps {
  mode: 'tri-state';
  value: TriStateValue;
  onChange: (next: TriStateValue) => void;
}

interface MultiProps extends BaseProps {
  mode: 'multi';
  value: string[];
  onChange: (next: string[]) => void;
}

export type ChipFlyoutProps = TriStateProps | MultiProps;

