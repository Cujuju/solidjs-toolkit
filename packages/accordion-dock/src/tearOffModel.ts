import { type Accessor } from 'solid-js';

/** Default popup size, px, when nothing has been persisted. Sized to a comfortable reading
 *  column rather than the docked width — a torn-off panel is being given room. */
export const TEAR_OFF_DEFAULT_WIDTH_PX = 520;
export const TEAR_OFF_DEFAULT_HEIGHT_PX = 680;

/** How often the opener checks whether a popup has gone away, ms. See DESIGN_NOTES.md § src/tearOff.tsx:95. */
export const TEAR_OFF_CLOSE_POLL_MS = 400;

/**
 * How often a popup checks that its opener is still alive, ms. Second line of
 * defence behind the opener's `beforeunload` — see `ORPHAN_WATCHDOG_SOURCE`.
 */
export const TEAR_OFF_ORPHAN_WATCHDOG_MS = 1000;

/** Sanity floor for restored geometry: a persisted 0x0, which a browser reports for a window
 *  queried after it closed, must never replay as an invisible window. */
export const TEAR_OFF_MIN_WINDOW_PX = 160;

/** Bumped when `TearOffGeometry` changes shape. A stored record with a different
 *  version is ignored rather than half-applied — same rule as `AccordionLayout`. */
export const TEAR_OFF_GEOMETRY_VERSION = 1;

/** `window.open`'s name argument. Namespaced per panel so re-tearing the same
 *  panel reuses its window instead of stacking a second one. */
export const TEAR_OFF_WINDOW_NAME_PREFIX = 'acc-tearoff-';

/** Screen position and outer size of a torn-off window. Best-effort — see (d). */
export interface TearOffGeometry {
  width: number;
  height: number;
  left: number;
  top: number;
}

interface PersistedGeometry extends TearOffGeometry {
  version: number;
}

/** Why a `tearOff()` call did not produce a window. Every one is reportable to
 *  the user; none is silently swallowed. */
export type TearOffFailureReason =
  /** `window.open` returned null — a blocker, or the call lost user activation
   *  by being made outside the originating event handler. The panel STAYS
   *  DOCKED; the caller is expected to surface this. */
  | 'popup-blocked'
  /** The panel is already torn off. The existing window is raised instead. */
  | 'already-torn-off';

export type TearOffResult = { ok: true } | { ok: false; reason: TearOffFailureReason };

export interface TearOffOptions {
  /** Window title for a panel's popup. The OS window chrome is the only label a
   *  torn-off panel has, so this is not optional. */
  titleOf: (id: string) => string;
  /** Persist each panel's window geometry under `<storageKey>:<panelId>`.
   *  Ephemeral if omitted, exactly like the group's own `storageKey`. */
  storageKey?: string;
  /** Fired when a tear-off fails. The caller owns the user-facing message — this
   *  module has no opinion about how a dock reports failure. */
  onError?: (id: string, reason: TearOffFailureReason) => void;
  onTearOff?: (id: string) => void;
  /** Fired when a panel comes back, by `dock()` or by the user closing the window. A consumer
   *  mirroring state needs both causes. */
  onDock?: (id: string) => void;
}

/** The tear-off surface, as it should appear on `AccordionGroupApi`. See DESIGN_NOTES.md § src/tearOff.tsx:225. */
export interface AccordionTearOffApi {
  /** Panel ids currently rendering into their own window. */
  tornOff: Accessor<readonly string[]>;
  isTornOff: (id: string) => boolean;
  /**
   * MUST be called synchronously from the user gesture. Returns the outcome rather than
   * throwing: a blocked popup is an ordinary browser setting, not an exception.
   */
  tearOff: (id: string) => TearOffResult;
  /** Bring the panel back into the dock and close its window. No-op if docked. */
  dock: (id: string) => void;
  /** Every torn-off panel comes home. The teardown path for the whole group. */
  dockAll: () => void;
  /** Best-effort raise of a panel's window. Browsers may ignore it — see (c). */
  focusWindow: (id: string) => void;
}

/** Everything `createTearOff` hands back: the group-facing API plus the one
 *  internal the outlet needs. Split so `AccordionTearOffApi` stays exactly what
 *  `AccordionGroupApi` should absorb, with no mount-plumbing leaking into it. */
export interface TearOffController extends AccordionTearOffApi {
  /** The popup body for `id`, or undefined while docked. Only `TearOffOutlet`
   *  should need this. */
  mountFor: (id: string) => HTMLElement | undefined;
}

export interface TornWindow {
  win: Window;
  doc: Document;
  /** Last geometry sampled while the window was demonstrably alive. Sampled on
   *  the poll tick because a window queried AFTER it closes reports zeroes. */
  geometry: TearOffGeometry;
  /** Everything to unwind on close, newest first. */
  teardown: Array<() => void>;
  /** Guards the close path against running twice — `pagehide` and the poll can
   *  both observe the same close. */
  closed: boolean;
}

function geometryStorageKey(storageKey: string, id: string): string {
  return `${storageKey}:${id}`;
}

export function readGeometry(
  storageKey: string | undefined,
  id: string,
): TearOffGeometry | null {
  if (storageKey === undefined) return null;
  try {
    const raw = localStorage.getItem(geometryStorageKey(storageKey, id));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const g = parsed as Partial<PersistedGeometry>;
    if (g.version !== TEAR_OFF_GEOMETRY_VERSION) return null;
    const finite = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n);
    if (!finite(g.width) || !finite(g.height) || !finite(g.left) || !finite(g.top))
      return null;
    // Size gets a floor; POSITION does not. A negative left/top is legitimate on
    // a monitor placed left of or above the primary one.
    if (g.width < TEAR_OFF_MIN_WINDOW_PX || g.height < TEAR_OFF_MIN_WINDOW_PX)
      return null;
    return { width: g.width, height: g.height, left: g.left, top: g.top };
  } catch {
    // A corrupt or blocked localStorage must not stop a panel tearing off.
    return null;
  }
}

export function writeGeometry(
  storageKey: string | undefined,
  id: string,
  g: TearOffGeometry,
): void {
  if (storageKey === undefined) return;
  try {
    const record: PersistedGeometry = { version: TEAR_OFF_GEOMETRY_VERSION, ...g };
    localStorage.setItem(geometryStorageKey(storageKey, id), JSON.stringify(record));
  } catch {
    // silent — persistence is a nicety, never a hard dependency
  }
}

/** Geometry of a live window, or null if it reports something impossible (which
 *  is what a closing window does). */
export function sampleGeometry(win: Window): TearOffGeometry | null {
  const g: TearOffGeometry = {
    width: win.outerWidth,
    height: win.outerHeight,
    left: win.screenX,
    top: win.screenY,
  };
  if (!Number.isFinite(g.width) || !Number.isFinite(g.height)) return null;
  if (g.width < TEAR_OFF_MIN_WINDOW_PX || g.height < TEAR_OFF_MIN_WINDOW_PX) return null;
  return g;
}

/**
 * `window.open`'s feature string. `popup` makes this a real window and its geometry eligible.
 * `noopener` is deliberately ABSENT: it would null the handle this module needs.
 */
export function featureString(g: TearOffGeometry): string {
  return [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    `width=${Math.round(g.width)}`,
    `height=${Math.round(g.height)}`,
    `left=${Math.round(g.left)}`,
    `top=${Math.round(g.top)}`,
  ].join(',');
}
