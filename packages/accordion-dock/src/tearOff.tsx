import { createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import { DelegatedEvents, Portal, delegateEvents } from 'solid-js/web';

/**
 * TEAR-OFF — pop a docked panel into its own browser window. Only CONTENT is portalled;
 * chrome binds the opener's document. See DESIGN_NOTES.md § src/tearOff.tsx:4.
 */

/** Default popup size, px, when nothing has been persisted. Sized to a comfortable reading
 *  column rather than the docked width — a torn-off panel is being given room. */
export const TEAR_OFF_DEFAULT_WIDTH_PX = 520;
export const TEAR_OFF_DEFAULT_HEIGHT_PX = 680;

/**
 * How often the opener checks whether a popup has gone away, ms. `pagehide` is the fast path
 * but is not guaranteed — a crashed renderer can skip it.
 */
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
const TEAR_OFF_WINDOW_NAME_PREFIX = 'acc-tearoff-';

/**
 * Distinguishes one controller's windows from another's. `prefix + panelId` collided, so a
 * second dock ADOPTED the first's. See DESIGN_NOTES.md § src/tearOff.tsx:126.
 */
let nextControllerId = 0;

/** Marks the style nodes THIS module put in the popup head, so a re-sync can
 *  replace exactly those and leave anything else alone. */
const TEAR_OFF_STYLE_MARKER_ATTR = 'data-acc-tearoff-style';

/** Both wrappers the Portal path introduces. `display: contents` when docked, so they cost no
 *  layout — but they DO sit in the selector chain, which the nested-group rules must allow for. */
const TEAR_OFF_HOST_ATTR = 'data-acc-tearoff-host';
const TEAR_OFF_CONTAINER_ATTR = 'data-acc-tearoff';

/** Style nodes worth mirroring: `<style>` in dev, `<link rel=stylesheet>` in prod. Handling
 *  one leaves the popup unstyled in exactly the half nobody tests. */
const STYLE_NODE_SELECTOR = 'style, link[rel~="stylesheet"]';

/**
 * Runs INSIDE the popup, surviving an opener death `beforeunload` cannot cover. An orphan
 * rendering from a dead graph is a frozen ghost. A strict CSP drops this silently.
 */
const ORPHAN_WATCHDOG_SOURCE = `(function () {
  setInterval(function () {
    if (!window.opener || window.opener.closed) window.close();
  }, ${TEAR_OFF_ORPHAN_WATCHDOG_MS});
})();`;

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

/**
 * The tear-off surface, as it should appear on `AccordionGroupApi`. NOT a third open-state
 * enum: it is orthogonal, and forcing it in would make every predicate lie.
 */
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

interface TornWindow {
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

function readGeometry(storageKey: string | undefined, id: string): TearOffGeometry | null {
  if (storageKey === undefined) return null;
  try {
    const raw = localStorage.getItem(geometryStorageKey(storageKey, id));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const g = parsed as Partial<PersistedGeometry>;
    if (g.version !== TEAR_OFF_GEOMETRY_VERSION) return null;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    if (!finite(g.width) || !finite(g.height) || !finite(g.left) || !finite(g.top)) return null;
    // Size gets a floor; POSITION does not. A negative left/top is legitimate on
    // a monitor placed left of or above the primary one.
    if (g.width < TEAR_OFF_MIN_WINDOW_PX || g.height < TEAR_OFF_MIN_WINDOW_PX) return null;
    return { width: g.width, height: g.height, left: g.left, top: g.top };
  } catch {
    // A corrupt or blocked localStorage must not stop a panel tearing off.
    return null;
  }
}

function writeGeometry(storageKey: string | undefined, id: string, g: TearOffGeometry): void {
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
function sampleGeometry(win: Window): TearOffGeometry | null {
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
function featureString(g: TearOffGeometry): string {
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

/** A style node reborn in the target document. Built fresh rather than
 *  `cloneNode`d — see the `href` comment, which is the reason. */
function adoptStyleNode(node: Element, target: Document): HTMLElement | null {
  if (node instanceof HTMLStyleElement) {
    // DEV path: Vite injects CSS as a `<style>` whose textContent it rewrites in
    // place on hot update. `syncStyles`'s observer is what keeps this current.
    const style = target.createElement('style');
    if (node.media !== '') style.media = node.media;
    style.textContent = node.textContent;
    return style;
  }
  if (node instanceof HTMLLinkElement) {
    // PROD path: `node.href` is the PROPERTY, already resolved absolute. Copying the ATTRIBUTE
    // would carry a relative path the popup re-resolves against `about:blank` and fails to load.
    const link = target.createElement('link');
    link.rel = 'stylesheet';
    link.href = node.href;
    if (node.media !== '') link.media = node.media;
    if (node.crossOrigin !== null) link.crossOrigin = node.crossOrigin;
    return link;
  }
  return null;
}

/**
 * Mirror the opener's stylesheets, and keep mirroring them. `adoptedStyleSheets` was rejected;
 * the observer exists for HMR. See DESIGN_NOTES.md § src/tearOff.tsx:370.
 */
function syncStyles(source: Document, target: Document): () => void {
  /** Rebuild the popup's stylesheets from the opener's. */
  const paintStyles = (): void => {
    for (const stale of Array.from(target.head.querySelectorAll(`[${TEAR_OFF_STYLE_MARKER_ATTR}]`))) {
      stale.remove();
    }
    // Scanned document-wide because a stray `<style>` in the body is legal. The observer watches
    // only the head, so a body style waits for the next resync.
    for (const node of Array.from(source.querySelectorAll(STYLE_NODE_SELECTOR))) {
      const adopted = adoptStyleNode(node, target);
      if (adopted === null) continue;
      adopted.setAttribute(TEAR_OFF_STYLE_MARKER_ATTR, '');
      target.head.appendChild(adopted);
    }
  };

  /**
   * Theme lives on the root or body as a class or attribute. Cloning the CSS without what it
   * keys off gives a popup styled in the WRONG theme.
   */
  const paintRootAttributes = (): void => {
    mirrorAttributes(source.documentElement, target.documentElement);
    mirrorAttributes(source.body, target.body);
  };

  /**
   * Coalesce a burst of mutations into one rebuild. Because the rebuild removes
   * and re-adds inside a single task there is no paint in between, so no flash.
   */
  const coalesce = (run: () => void): (() => void) => {
    let scheduled = false;
    return () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (target.defaultView === null) return; // window went away mid-flight
        run();
      });
    };
  };

  paintStyles();
  paintRootAttributes();

  // TWO observers with deliberately narrow scopes. One document-wide subtree observer would
  // fire on every `data-open` flip, rebuilding the popup's stylesheets on every pointermove.
  const styleObserver = new MutationObserver(coalesce(paintStyles));
  styleObserver.observe(source.head, {
    childList: true,
    subtree: true,
    // Vite's hot update assigns to an existing `style.textContent`, which surfaces as
    // characterData or a childList swap rather than a new element. Both are watched.
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'media', 'rel', 'disabled'],
  });

  const attributeObserver = new MutationObserver(coalesce(paintRootAttributes));
  const rootAttributeInit: MutationObserverInit = { attributes: true, subtree: false };
  attributeObserver.observe(source.documentElement, rootAttributeInit);
  attributeObserver.observe(source.body, rootAttributeInit);

  return () => {
    styleObserver.disconnect();
    attributeObserver.disconnect();
  };
}

/** Copy every attribute across, dropping any the source no longer has. Blunt on
 *  purpose: enumerating "theme-ish" attribute names would silently miss whatever
 *  the host app actually uses. */
/**
 * Attributes the TARGET owns, which mirroring must never touch. `style` is load-bearing.
 * See DESIGN_NOTES.md § src/tearOff.tsx:468.
 */
const TARGET_OWNED_ATTRS = new Set(['style']);

/**
 * Make `to`'s attributes match `from`'s, except the ones `to` owns. Carries the opener's theme
 * signals (`class`, `data-theme`, `dir`) so cloned CSS keys off the same state.
 */
function mirrorAttributes(from: Element, to: Element): void {
  for (const attr of Array.from(from.attributes)) {
    if (TARGET_OWNED_ATTRS.has(attr.name)) continue;
    if (to.getAttribute(attr.name) !== attr.value) to.setAttribute(attr.name, attr.value);
  }
  for (const attr of Array.from(to.attributes)) {
    if (TARGET_OWNED_ATTRS.has(attr.name)) continue;
    if (!from.hasAttribute(attr.name)) to.removeAttribute(attr.name);
  }
}

/**
 * Bring a blank popup document up to hosting a panel. Returns teardown steps newest-first, so
 * the close path is the exact inverse rather than a second list.
 */
function prepareDocument(win: Window, title: string): Array<() => void> {
  const doc = win.document;
  const teardown: Array<() => void> = [];

  // `about:blank` inherits the opener's origin, so this is same-origin scriptable. An explicit
  // <base> removes any doubt for relative `url()` in the cloned CSS.
  const base = doc.createElement('base');
  base.href = document.baseURI;
  doc.head.appendChild(base);

  doc.title = title;

  // The window IS the panel: no margin, no document scroll (the panel's content owns its own),
  // and a column flexbox for the Portal container to fill.
  doc.body.style.margin = '0';
  doc.body.style.height = '100vh';
  doc.body.style.overflow = 'hidden';
  doc.body.style.display = 'flex';
  doc.body.style.flexDirection = 'column';

  teardown.push(syncStyles(document, doc));

  // See (3) in the header: without this every delegated handler inside the popup is dead,
  // because the compiler only ever registered them on the opener.
  delegateEvents([...DelegatedEvents], doc);

  const watchdog = doc.createElement('script');
  watchdog.textContent = ORPHAN_WATCHDOG_SOURCE;
  doc.body.appendChild(watchdog);

  return teardown;
}

/**
 * Own a set of torn-off windows for one accordion group. Takes an `onCleanup`, so a group
 * unmounting takes its popups with it — the leak `beforeunload` covers, at component
 * granularity.
 */
export function createTearOff(options: TearOffOptions): TearOffController {
  const controllerId = nextControllerId++;
  const [tornOff, setTornOff] = createSignal<readonly string[]>([]);
  const windows = new Map<string, TornWindow>();

  const isTornOff = (id: string): boolean => tornOff().includes(id);

  /**
   * The single close path. Every route to "this panel is docked again" funnels through here,
   * so the ordering rule below is stated once instead of at four callsites.
   */
  const finish = (id: string, closeWindow: boolean): void => {
    const rec = windows.get(id);
    if (rec === undefined || rec.closed) return;
    rec.closed = true;
    windows.delete(id);
    for (const step of rec.teardown.reverse()) step();

    // One last sample before persisting: the poll refreshes only every tick, so a window moved
    // then docked would be remembered at its previous position. Guarded — a closed window
    // reports zeros.
    if (!rec.win.closed) {
      const finalSample = sampleGeometry(rec.win);
      if (finalSample !== null) rec.geometry = finalSample;
    }
    writeGeometry(options.storageKey, id, rec.geometry);

    // ORDER MATTERS. Flipping the signal first re-runs Portal's effect, moving the live nodes
    // home while the popup document is still healthy. Closing first would re-parent out of a
    // torn-down document.
    setTornOff((prev) => prev.filter((v) => v !== id));
    if (closeWindow && !rec.win.closed) {
      // The effect above runs synchronously at the end of this update, so the nodes are already
      // home; the deferral only guards a future batching change making that untrue.
      queueMicrotask(() => rec.win.close());
    }
    options.onDock?.(id);
  };

  const tearOff = (id: string): TearOffResult => {
    if (isTornOff(id)) {
      focusWindow(id);
      return { ok: false, reason: 'already-torn-off' };
    }

    const stored = readGeometry(options.storageKey, id);
    // Centre on the opener when nothing is remembered — a window at the OS default position
    // reads as unrelated to the click that produced it.
    const geometry: TearOffGeometry = stored ?? {
      width: TEAR_OFF_DEFAULT_WIDTH_PX,
      height: TEAR_OFF_DEFAULT_HEIGHT_PX,
      left: Math.round(window.screenX + (window.outerWidth - TEAR_OFF_DEFAULT_WIDTH_PX) / 2),
      top: Math.round(window.screenY + (window.outerHeight - TEAR_OFF_DEFAULT_HEIGHT_PX) / 2),
    };

    const title = options.titleOf(id);
    const win = window.open(
      '',
      `${TEAR_OFF_WINDOW_NAME_PREFIX}${controllerId}-${id}`,
      featureString(geometry),
    );

    // A blocked popup returns null. The panel STAYS DOCKED and the caller is told: the one thing
    // that must not happen is a click that appears to do nothing.
    if (win === null) {
      options.onError?.(id, 'popup-blocked');
      return { ok: false, reason: 'popup-blocked' };
    }

    const rec: TornWindow = {
      win,
      doc: win.document,
      geometry,
      teardown: prepareDocument(win, title),
      closed: false,
    };

    // Fast path for the ordinary close. `pagehide`, not `unload`, which is unreliable under
    // bfcache. A RELOAD lands here too, and re-docking is right: the reloaded document is blank.
    const onPageHide = (): void => finish(id, false);
    win.addEventListener('pagehide', onPageHide);
    rec.teardown.push(() => win.removeEventListener('pagehide', onPageHide));

    // Slow path + the geometry sampler. See TEAR_OFF_CLOSE_POLL_MS for why the
    // event above is not enough on its own.
    const poll = window.setInterval(() => {
      if (win.closed) {
        finish(id, false);
        return;
      }
      const g = sampleGeometry(win);
      if (g !== null) rec.geometry = g;
    }, TEAR_OFF_CLOSE_POLL_MS);
    rec.teardown.push(() => window.clearInterval(poll));

    windows.set(id, rec);
    setTornOff((prev) => [...prev, id]);
    options.onTearOff?.(id);
    return { ok: true };
  };

  const focusWindow = (id: string): void => {
    // Best-effort by contract — see (c). Not reported as a failure, because a
    // browser refusing to raise a window is not something the caller can act on.
    windows.get(id)?.win.focus();
  };

  const dockAll = (): void => {
    for (const id of [...windows.keys()]) finish(id, true);
  };

  /**
   * An opener that unloads must take its popups with it — one outliving its opener still
   * PAINTS from a dead graph. See DESIGN_NOTES.md § src/tearOff.tsx:684.
   */
  const onOpenerGone = (): void => {
    for (const [id, rec] of windows) {
      rec.closed = true;
      for (const step of rec.teardown.reverse()) step();
      writeGeometry(options.storageKey, id, rec.geometry);
      if (!rec.win.closed) rec.win.close();
    }
    windows.clear();
    // Matters only for the bfcache path, where the page can later be RESTORED: leaving ids in
    // `tornOff` would come back as panels marked torn-off with no window behind them.
    setTornOff([]);
  };
  window.addEventListener('beforeunload', onOpenerGone);
  window.addEventListener('pagehide', onOpenerGone);

  onCleanup(() => {
    window.removeEventListener('beforeunload', onOpenerGone);
    window.removeEventListener('pagehide', onOpenerGone);
    dockAll();
  });

  return {
    tornOff,
    isTornOff,
    tearOff,
    dock: (id) => finish(id, true),
    dockAll,
    focusWindow,
    mountFor: (id) => (isTornOff(id) ? windows.get(id)?.doc.body : undefined),
  };
}

/**
 * Wrap a panel's content so it renders into the dock OR its window, without being rebuilt.
 * ONE `<Portal>` whose `mount` toggles. See DESIGN_NOTES.md § src/tearOff.tsx:733.
 */
/**
 * ⚠ EXPORTED BUT UNUSED — superseded by the mount-precedence Portal in `AccordionPanel`. This
 * knows only about the popup, so a panel using it could not also fly out.
 */
export function TearOffOutlet(props: {
  id: string;
  api: TearOffController;
  children: JSX.Element;
}): JSX.Element {
  // Not reactive and need not be: created with this component, lives exactly as long. Portal
  // reads `mount` in an effect, which runs after the ref is filled.
  let host!: HTMLDivElement;

  const mount = (): HTMLElement => props.api.mountFor(props.id) ?? host;

  /**
   * Portal calls this with each container it creates, so it is the natural place to make the
   * container's box depend on where it landed.
   */
  const decorateContainer = (container: HTMLDivElement): void => {
    container.setAttribute(TEAR_OFF_CONTAINER_ATTR, '');
    if (props.api.isTornOff(props.id)) {
      // In the popup the container IS the window's content area.
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = '1 1 auto';
      container.style.minHeight = '0';
    } else {
      // In the dock it must not exist as far as layout is concerned.
      container.style.display = 'contents';
    }
  };

  return (
    <div
      ref={(el) => {
        host = el;
        // Set through the ref rather than as a JSX attribute, so the attribute name stays the single
        // named constant the CSS note refers to.
        el.setAttribute(TEAR_OFF_HOST_ATTR, '');
      }}
      style={{ display: 'contents' }}
    >
      <Portal mount={mount()} ref={decorateContainer}>
        {props.children}
      </Portal>
    </div>
  );
}
