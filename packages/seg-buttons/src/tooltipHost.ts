/**
 * tooltipHost — WHERE a `SegButton`'s `title` hint gets rendered.
 *
 * A SegButton has exactly one hint prop (`title`). It can be painted two ways:
 *
 *   - the browser's native `title` attribute — always available, never styleable,
 *     and timed by the OS;
 *   - a real tooltip component (`@cujuju/solidjs-kv-tooltip`'s `KvTooltip`) —
 *     styleable, delay-controlled, and reachable by a screen reader through the
 *     trigger's `aria-describedby`.
 *
 * The CALLER of SegButton never picks between them: it passes `title` and gets
 * whichever mechanism this host has. That is the whole point of the indirection —
 * a consumer that wires a tooltip host once upgrades every SegButton hint in the
 * app, and a consumer that wires nothing still gets a working native hint.
 *
 * ── Why REGISTRATION and not auto-detection ─────────────────────────────────
 * `@cujuju/solidjs-kv-tooltip` is an OPTIONAL peer dependency. This module
 * therefore must not `import` it — not statically and not dynamically:
 *
 *   - a static import of an uninstalled bare specifier fails the CONSUMER's
 *     build, which turns "optional" into "required";
 *   - a dynamic `import()` is resolved statically by every bundler we target
 *     (Vite/Rollup, esbuild, webpack), so it fails the same build in the same
 *     way — the try/catch around it never runs, because the failure is at build
 *     time, not run time.
 *
 * So the consumer hands the component IN. `setSegTooltipHost(KvTooltip)` at app
 * boot is one line, has no bundler failure mode, and keeps this package's
 * dependency graph empty. seg-buttons stays unaware that kv-tooltip exists.
 *
 * ── Contract ────────────────────────────────────────────────────────────────
 * The host is stored in a SIGNAL, so registering it after some SegButtons have
 * already mounted upgrades them in place rather than leaving a mixed bar.
 */

import { createSignal, type JSX } from 'solid-js';

/**
 * The props a tooltip host must accept to serve as a SegButton hint renderer.
 *
 * This is a STRUCTURAL subset of `KvTooltipProps`, declared locally so this
 * package needs no type-level dependency on kv-tooltip either. `KvTooltip` is
 * assignable to `SegTooltipHost` because every field below matches its own and
 * everything else it accepts is optional.
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
   * `'contents'` is REQUIRED by SegGroup's layout: the group lays its children
   * out with flex and its corner/border CSS reaches them as children, so a host
   * that introduces a layout box would break the joined-control look.
   */
  wrapperLayout?: 'contents';
  /** Dismiss on pointer-down, so clicking a segment does not leave a panel up. */
  hideOnPointerDown?: boolean;
}

/** A component that can render a SegButton's hint. `KvTooltip` satisfies this. */
export type SegTooltipHost = (props: SegTooltipHostProps) => JSX.Element;

/**
 * Default hover dwell before a hint appears, ms.
 *
 * A tooltip answers a question the user paused to ask, so it must not fire while
 * the pointer is merely passing through — a segmented control is a ROW of
 * adjacent triggers, and a short delay turns one sweep across it into a strobe
 * of panels. Native `title` parity (~1s) is the opposite failure: correct on a
 * sweep, sluggish once you have actually stopped and are waiting.
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
 * Register (or clear, with `null`) the component that renders SegButton hints.
 * Call once at app boot:
 *
 * ```ts
 * import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';
 * import { setSegTooltipHost } from '@cujuju/solidjs-seg-buttons';
 * setSegTooltipHost(KvTooltip);
 * ```
 *
 * Without this call every SegButton hint renders as a native `title`.
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
