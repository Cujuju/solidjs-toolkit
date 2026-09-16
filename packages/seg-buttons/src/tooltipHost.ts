/**
 * Where a SegButton `title` renders: native, or a consumer-registered host. Registration, not
 * import: kv-tooltip is an optional peer, and dynamic imports fail consumer builds.
 * Signal-backed: late registration upgrades mounted buttons.
 */

import { createSignal, type JSX } from 'solid-js';

/**
 * Props a hint host must accept: a structural subset of `KvTooltipProps`, declared locally to
 * avoid a type dependency.
 */
export interface SegTooltipHostProps {
  /** Key/value rows. A SegButton hint is prose, not a table, so it passes `{}`. */
  entries: Record<string, string>;
  /** The trigger being described — the button itself. */
  children: JSX.Element;
  /** The hint text, exposed to assistive tech via `aria-describedby`. */
  description?: string;
  /** Free-form panel body — where the hint text is actually PAINTED. */
  extraContent?: JSX.Element;
  /** Hover dwell before the panel appears, ms. */
  showDelayMs?: number;
  /** Panel width cap. */
  maxWidth?: number | string;
  /**
   * REQUIRED: SegGroup's flex and border CSS reach its children directly, so a host layout box
   * breaks the joined look.
   */
  wrapperLayout?: 'contents';
  /** Dismiss on pointer-down, so clicking a segment does not leave a panel up. */
  hideOnPointerDown?: boolean;
}

/** A component that can render a SegButton's hint. `KvTooltip` satisfies this. */
export type SegTooltipHost = (props: SegTooltipHostProps) => JSX.Element;

/**
 * Default hover dwell, ms. Short delays strobe panels on a sweep across adjacent segments;
 * native `title` parity (~1s) feels sluggish once stopped.
 */
const DEFAULT_SEG_TOOLTIP_DELAY_MS = 600;

/**
 * Default panel width cap, px. A segment hint is a short phrase; the cap exists
 * for the occasional sentence, and keeps a long one from spanning the viewport.
 */
const DEFAULT_SEG_TOOLTIP_MAX_WIDTH_PX = 300;

/** Timing/sizing shared by every SegButton hint in the app. */
export interface SegTooltipDefaults {
  delayMs: number;
  maxWidth: number | string;
}

const [host, setHost] = createSignal<SegTooltipHost | null>(null);

const [defaults, setDefaults] = createSignal<SegTooltipDefaults>({
  delayMs: DEFAULT_SEG_TOOLTIP_DELAY_MS,
  maxWidth: DEFAULT_SEG_TOOLTIP_MAX_WIDTH_PX,
});

/**
 * Register (or clear with `null`) the hint renderer, once at app boot, e.g.
 * `setSegTooltipHost(KvTooltip)`. Unregistered hints render as native `title`.
 */
export function setSegTooltipHost(next: SegTooltipHost | null): void {
  // Wrapped in a thunk: a Solid setter treats a bare function argument as an
  // UPDATER, and the host IS a function.
  setHost(() => next);
}

/**
 * The registered host, or `null` when none is. Reactive — a SegButton that
 * mounted before registration re-renders through the real host once it lands.
 */
export function useSegTooltipHost(): SegTooltipHost | null {
  return host();
}

/** Re-time or re-size every SegButton hint at once. Merges over the current values. */
export function setSegTooltipDefaults(next: Partial<SegTooltipDefaults>): void {
  setDefaults((prev) => ({ ...prev, ...next }));
}

/** Current defaults. Reactive. */
export function segTooltipDefaults(): SegTooltipDefaults {
  return defaults();
}
