import { createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import { DelegatedEvents, Portal, delegateEvents } from 'solid-js/web';

/**
 * TEAR-OFF — pop a docked panel into a real second browser window.
 *
 * Fully wired: `index.ts` exports it,
 * `AccordionGroup` builds the controller, and `AccordionPanel` renders the ⤢
 * affordance behind its `tearOffable` prop. (This paragraph claimed the opposite
 * until 2026-07-25 — it was written before the wiring landed and nothing made it
 * false out loud. A stale "not implemented yet" is worse than no comment: it tells
 * a reader to go and build what is already there.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT ACTUALLY WORKS IN A BROWSER TAB — verified against solid-js 1.9.12 in
 * this repo's node_modules, not assumed:
 *
 * 1. `<Portal mount={otherDocument.body}>` DOES render into a foreign document.
 *    `Portal` builds its container with the OPENER's `document.createElement`
 *    and then does `mount.appendChild(container)`; per the DOM spec `appendChild`
 *    runs the adopting steps, so the subtree's `ownerDocument` becomes the
 *    popup's. Nothing in Portal compares documents, so there is no throw.
 *    (solid-js/web/dist/web.js — `function Portal`, and `createElement`, which is
 *    hard-bound to the module-scope `document`.)
 *
 * 2. `mount` is READ INSIDE Portal's `createEffect`, and the children memo is
 *    created once and cached (`content || (content = ...)`). So changing `mount`
 *    from the docked host to the popup body MOVES the existing nodes and REUSES
 *    the existing reactive graph — no remount, no lost component state. That is
 *    why this module always renders through one Portal whose `mount` toggles,
 *    rather than swapping between an inline branch and a Portal branch: the
 *    latter re-evaluates the children and destroys everything the panel's
 *    "content stays mounted while collapsed" rule exists to protect.
 *
 * 3. Solid's event DELEGATION does not cross documents on its own. Compiled JSX
 *    emits `delegateEvents(["click", ...])`, which does
 *    `document.addEventListener` on the OPENER document only; a click in the
 *    popup bubbles to the POPUP's document, where nothing is listening, so every
 *    `onClick` inside a torn-off panel would be dead. The fix is first-class and
 *    not a hack: `delegateEvents(eventNames, d?: Document)` takes the target
 *    document (see `solid-js/web/types/client.d.ts:29`), so we register the same
 *    handler on the popup document. Solid's `eventHandler` then walks up from
 *    `e.target`, and when it reaches Portal's container it follows the
 *    container's `_$host` getter back into the OPENER's tree — so a handler on an
 *    ancestor *in the dock* still fires for a click *in the popup*. That
 *    cross-document walk is the whole reason delegation and Portal compose.
 *
 * WHAT DOES NOT WORK, and why (read this before extending):
 *
 * a. Anything that captured the OPENER's `window`/`document` at module scope
 *    keeps talking to the opener. In THIS control that is `resize.ts` (splitter
 *    drags add `pointermove`/`pointerup` to the opener `window`),
 *    `vendor/createReorderList.ts` (same, on the opener `document`) and
 *    `vendor/shared.ts` (menu dismissal on the opener `document`/`window`). A
 *    pointer gesture that starts inside the popup dispatches into the POPUP's
 *    document, so those listeners never fire and a drag would start and never
 *    end. Consequence, deliberate: only the panel's CONTENT is portalled. Do not
 *    portal the panel's chrome (splitter, rail button, context-menu trigger)
 *    into the popup without first making those helpers take a document.
 *
 * b. `createPanelMenu` → `ContextMenu` portals itself to `document.body` — the
 *    OPENER's body. A right-click inside the popup would open its menu in the
 *    other window. Same root cause as (a): a hard-bound `document`.
 *
 * c. Focus cannot be moved across windows. `moveFocus` calling `el.focus()` on an
 *    element in the popup focuses it *within that document* but does not raise
 *    the window; `window.focus()` is a request browsers routinely ignore. So
 *    roving keyboard focus cannot walk from a docked panel into a torn-off one.
 *    This is a browser limitation, not a fixable bug — an Electron host would
 *    provide it via `BrowserWindow.focus()`.
 *
 * d. Window PLACEMENT is a hint. `left`/`top`/`width`/`height` are honoured only
 *    for a genuine popup, and only on the primary screen unless the page holds
 *    the Window Management permission; several browsers clamp or ignore them
 *    outright. Geometry persistence below is therefore best-effort by design.
 *
 * e. `window.open` requires TRANSIENT USER ACTIVATION. `tearOff()` must be called
 *    synchronously from the click/keydown handler — after an `await` or a
 *    `setTimeout` the activation is spent and the popup is blocked. That case is
 *    reported, never swallowed.
 *
 * f. Vite HMR replaces the opener's `<style>` tags but cannot reach a module
 *    graph that is rendering into another document. Style edits are re-synced
 *    (see `syncStyles`); a hot-replaced COMPONENT is not, and the popup keeps
 *    rendering the old one until the panel is docked and torn off again.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Default popup size, px, when nothing has been persisted for this panel. Sized
 *  to a comfortable reading column rather than the panel's docked width — a torn
 *  off panel is being given room on purpose. */
export const TEAR_OFF_DEFAULT_WIDTH_PX = 520;
export const TEAR_OFF_DEFAULT_HEIGHT_PX = 680;

/**
 * How often the opener checks whether a popup has gone away, ms.
 *
 * A popup's `pagehide` is the fast path and fires for the normal close, but it is
 * NOT guaranteed — a crashed renderer, or a close during the opener's own
 * teardown, can skip it entirely. Without this poll a panel could stay marked
 * torn-off with no window to render into, which is unrecoverable from the UI.
 * 400ms is below the threshold where a user reads the re-dock as laggy while
 * still being a rounding error against the event path that normally wins.
 */
export const TEAR_OFF_CLOSE_POLL_MS = 400;

/**
 * How often a popup checks that its opener is still alive, ms. Second line of
 * defence behind the opener's `beforeunload` — see `ORPHAN_WATCHDOG_SOURCE`.
 */
export const TEAR_OFF_ORPHAN_WATCHDOG_MS = 1000;

/** Sanity floor for restored geometry. A persisted 0×0 (which a browser will
 *  report for a window queried after it closed) must never be replayed as an
 *  invisible window the user cannot find. */
export const TEAR_OFF_MIN_WINDOW_PX = 160;

/** Bumped when `TearOffGeometry` changes shape. A stored record with a different
 *  version is ignored rather than half-applied — same rule as `AccordionLayout`. */
export const TEAR_OFF_GEOMETRY_VERSION = 1;

/** `window.open`'s name argument. Namespaced per panel so re-tearing the same
 *  panel reuses its window instead of stacking a second one. */
const TEAR_OFF_WINDOW_NAME_PREFIX = 'acc-tearoff-';

/**
 * Distinguishes one controller's windows from another's.
 *
 * The name used to be `prefix + panelId`, with a comment claiming that stopped two
 * groups on a page colliding. It did not: two docks holding a panel with the same
 * id — `explorer`, say, which is exactly the kind of id that repeats — produced the
 * same window name, so the second dock's tear-off ADOPTED the first's window
 * instead of opening its own. `window.open` with an existing name returns that
 * window, and `prepareDocument` then appended a second panel's chrome into a
 * document already holding the first's.
 *
 * The same shape bites a single group across an HMR remount: the old controller's
 * window survives (the opener is still alive, so the orphan watchdog does not fire)
 * and the new controller adopts it, stale content and all.
 *
 * A per-instance counter rather than a random id: it is deterministic, needs no
 * crypto, and answers the question actually being asked — "is this the same
 * controller?" — which is scoped to one document. Across a reload the counter
 * restarts, and that is correct, because the reloading document's `beforeunload`
 * closes its windows on the way out.
 */
let nextControllerId = 0;

/** Marks the style nodes THIS module put in the popup head, so a re-sync can
 *  replace exactly those and leave anything else alone. */
const TEAR_OFF_STYLE_MARKER_ATTR = 'data-acc-tearoff-style';

/** Both wrappers the Portal path introduces around a panel's content. They are
 *  `display: contents` when docked (see `decorateContainer`), so they cost no
 *  layout — but they DO sit in the selector chain, which is why the two
 *  nested-group rules in styles.css need widening. Called out in the handoff. */
const TEAR_OFF_HOST_ATTR = 'data-acc-tearoff-host';
const TEAR_OFF_CONTAINER_ATTR = 'data-acc-tearoff';

/** Style nodes worth mirroring into the popup. `<style>` is what Vite's dev
 *  server injects (it ships CSS as JS that appends a style tag); `<link
 *  rel=stylesheet>` is what a production build emits. Both paths exist because
 *  the SAME code runs under both, and handling only one means the popup is
 *  unstyled in exactly one of dev or prod — the half that nobody tests. */
const STYLE_NODE_SELECTOR = 'style, link[rel~="stylesheet"]';

/**
 * Runs INSIDE the popup, in the popup's own realm, so it survives the opener
 * dying in a way the opener's `beforeunload` cannot cover (crash, force-quit,
 * `beforeunload` skipped by the browser). Belt to `beforeunload`'s suspenders:
 * an orphan window rendering from a dead reactive graph is a frozen ghost, and
 * the user has no way to tell it apart from a live one.
 *
 * A page with a strict CSP that forbids inline script will silently drop this;
 * the opener-side `beforeunload` is still the primary mechanism, so the failure
 * mode degrades to "orphan survives an opener CRASH", not "orphan always".
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
  /** Fired when a panel comes back — whether by `dock()` or by the user closing
   *  the window. A consumer mirroring state needs both causes, not just its own
   *  call, for the same reason `onChange` reports auto-collapses. */
  onDock?: (id: string) => void;
}

/**
 * The tear-off surface, as it should eventually appear on `AccordionGroupApi`.
 *
 * Exported as its own interface because `context.ts` is owned elsewhere; the
 * handoff note lists the literal lines to paste. A torn-off panel is deliberately
 * NOT modelled as a third open-state enum: it is orthogonal — a panel can be torn
 * off while its rail slot stays in `order`, and forcing it into `open`/`closed`
 * would make every existing predicate lie about it.
 */
export interface AccordionTearOffApi {
  /** Panel ids currently rendering into their own window. */
  tornOff: Accessor<readonly string[]>;
  isTornOff: (id: string) => boolean;
  /**
   * MUST be called synchronously from the user gesture — see (e). Returns the
   * outcome rather than throwing: a blocked popup is an ordinary, expected
   * result of a user's browser settings, not an exception.
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
 * `window.open`'s feature string.
 *
 * `popup` is what makes this a real chromeless window rather than a tab — and
 * it is also the switch that makes width/height/left/top eligible to be honoured
 * at all. `noopener` is deliberately ABSENT: it would null out the returned
 * handle, and this whole module is built on holding that handle.
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
    // PROD path: a built bundle emits `<link rel=stylesheet href="/assets/…">`.
    // `node.href` is the PROPERTY, which is already resolved absolute against the
    // opener's base URL. Copying the ATTRIBUTE instead would carry a relative
    // path that the popup would re-resolve against `about:blank` and fail to
    // load — an unstyled window with no error in the opener's console.
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
 * Mirror the opener's stylesheets into the popup, and keep mirroring them.
 *
 * `adoptedStyleSheets` was considered and rejected: a constructed `CSSStyleSheet`
 * is bound to the document that constructed it, so handing the opener's sheets to
 * the popup's `adoptedStyleSheets` is a spec-level error, and rebuilding them in
 * the popup realm would mean reading `cssRules` — which throws for any
 * cross-origin sheet. Cloning nodes has neither problem and works for both the
 * dev and prod shapes above.
 *
 * The MutationObserver exists for HMR: Vite mutates the opener's style tags on
 * every CSS save, and without it a torn-off panel keeps the stylesheet it was
 * born with for the rest of the session. Repaints are coalesced into one
 * microtask so a burst of mutations costs one rebuild, and because the rebuild
 * removes and re-adds within a single task there is no paint in between and so
 * no flash.
 */
function syncStyles(source: Document, target: Document): () => void {
  /** Rebuild the popup's stylesheets from the opener's. */
  const paintStyles = (): void => {
    for (const stale of Array.from(target.head.querySelectorAll(`[${TEAR_OFF_STYLE_MARKER_ATTR}]`))) {
      stale.remove();
    }
    // Scanned document-wide rather than head-only because a stray `<style>` in
    // the body is legal and still applies. The OBSERVER below only watches the
    // head, which is where every injector this control meets actually writes —
    // so a style element appended to the body after the tear-off is picked up on
    // the next resync, not instantly.
    for (const node of Array.from(source.querySelectorAll(STYLE_NODE_SELECTOR))) {
      const adopted = adoptStyleNode(node, target);
      if (adopted === null) continue;
      adopted.setAttribute(TEAR_OFF_STYLE_MARKER_ATTR, '');
      target.head.appendChild(adopted);
    }
  };

  /**
   * Theme lives on the root/body as a class or data-attribute in every scheme
   * this control has to survive (`.dark`, `data-theme="…"`, an inline `--token`
   * block). Cloning the CSS without the attributes it keys off gives a popup
   * that is styled but in the WRONG theme, which reads as a bug rather than as a
   * missing feature.
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

  // TWO observers with deliberately narrow scopes. A single document-wide
  // `attributes: true, subtree: true` observer would fire on every `data-open` /
  // `data-resizing` flip this control makes — a splitter drag would rebuild the
  // popup's entire stylesheet set on every pointermove.
  const styleObserver = new MutationObserver(coalesce(paintStyles));
  styleObserver.observe(source.head, {
    childList: true,
    subtree: true,
    // Vite's hot update assigns to an existing `style.textContent`, which
    // surfaces as characterData (or a childList swap of the text node,
    // engine-dependent) rather than as a new element. Both are watched.
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
 * Attributes the TARGET owns, which mirroring must never touch.
 *
 * `style` only, and it is load-bearing. `prepareDocument` builds the popup's
 * frame in inline styles on `<body>` — `margin: 0`, `height: 100vh`, `overflow:
 * hidden`, and the column flexbox the Portal container fills. `syncStyles` then
 * calls `mirrorAttributes(source.body, target.body)`, and because the opener's
 * own `<body>` carries no inline style in any normal page, the reconciliation
 * loop below removed the popup's `style` attribute outright — wiping that frame
 * milliseconds after it was set, and again on every coalesced resync.
 *
 * The visible result was a torn-off panel that did not fill its window and a
 * popup document that scrolled, which is precisely the "the window IS the panel"
 * contract `prepareDocument` documents.
 *
 * Excluded by NAME rather than by switching to a class/data-* allowlist, because
 * the mirror legitimately carries more than theme: `dir` drives this control's
 * RTL handling, and an allowlist built around theming would silently drop it.
 */
const TARGET_OWNED_ATTRS = new Set(['style']);

/**
 * Make `to`'s attributes match `from`'s — except the ones `to` owns.
 *
 * Used to carry the opener's theme signals (`class`, `data-theme`, `dir`) into
 * the popup, so cloned CSS keys off the same state it does at home.
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
 * Bring a blank popup document up to the point where it can host a panel.
 *
 * Returns the teardown steps, newest-first, so the close path is the exact
 * inverse of this function rather than a second list that can drift from it.
 */
function prepareDocument(win: Window, title: string): Array<() => void> {
  const doc = win.document;
  const teardown: Array<() => void> = [];

  // `about:blank` inherits the opener's origin, so everything below is
  // same-origin scriptable. It also inherits the opener's base URL per spec, but
  // an explicit <base> removes the doubt for any relative `url()` in the cloned
  // CSS — cheap insurance against a rule that only bites on one engine.
  const base = doc.createElement('base');
  base.href = document.baseURI;
  doc.head.appendChild(base);

  doc.title = title;

  // The window IS the panel, so the body is the panel's frame: no margin, no
  // document scroll (the panel's own content owns its scrolling, exactly as it
  // does in a column), and a column flexbox for the Portal container to fill.
  doc.body.style.margin = '0';
  doc.body.style.height = '100vh';
  doc.body.style.overflow = 'hidden';
  doc.body.style.display = 'flex';
  doc.body.style.flexDirection = 'column';

  teardown.push(syncStyles(document, doc));

  // See (3) in the header: without this every delegated handler inside the popup
  // is dead, because the compiler only ever registered them on the opener.
  delegateEvents([...DelegatedEvents], doc);

  const watchdog = doc.createElement('script');
  watchdog.textContent = ORPHAN_WATCHDOG_SOURCE;
  doc.body.appendChild(watchdog);

  return teardown;
}

/**
 * Own a set of torn-off windows for one accordion group.
 *
 * Call in a component body: it takes an `onCleanup` so that a group unmounting
 * (a route change, an HMR boundary) takes its popups with it — the same leak
 * `beforeunload` covers for a whole-page teardown, at component granularity.
 */
export function createTearOff(options: TearOffOptions): TearOffController {
  const controllerId = nextControllerId++;
  const [tornOff, setTornOff] = createSignal<readonly string[]>([]);
  const windows = new Map<string, TornWindow>();

  const isTornOff = (id: string): boolean => tornOff().includes(id);

  /**
   * The single close path. Every route to "this panel is docked again" funnels
   * through here — user closed the window, `dock()` was called, the group
   * unmounted, the opener is unloading — so the ordering rule below is stated
   * once instead of at four callsites.
   */
  const finish = (id: string, closeWindow: boolean): void => {
    const rec = windows.get(id);
    if (rec === undefined || rec.closed) return;
    rec.closed = true;
    windows.delete(id);
    for (const step of rec.teardown.reverse()) step();

    // One last sample before persisting. The poll only refreshes `rec.geometry`
    // every TEAR_OFF_CLOSE_POLL_MS, so without this a window moved or resized
    // inside that window of time — then docked — would be remembered at its
    // PREVIOUS position, and the user's last adjustment would be the one change
    // that did not stick.
    //
    // Best-effort and guarded: on the user-closed path the window is already
    // gone, and reading geometry off a closed window yields zeros or throws.
    // `sampleGeometry` rejects degenerate values on its own, so a refusal here
    // simply leaves the last good poll sample in place.
    if (!rec.win.closed) {
      const finalSample = sampleGeometry(rec.win);
      if (finalSample !== null) rec.geometry = finalSample;
    }
    writeGeometry(options.storageKey, id, rec.geometry);

    // ORDER MATTERS. Flipping the signal first re-runs Portal's effect, which
    // removes its container from the popup body and re-appends it to the docked
    // host — moving the live nodes home while the popup document is still
    // healthy. Closing first would leave the effect re-parenting out of a
    // torn-down document.
    setTornOff((prev) => prev.filter((v) => v !== id));
    if (closeWindow && !rec.win.closed) {
      // The effect above runs synchronously at the end of this update, so the
      // nodes are already home by the time the microtask closes the window; the
      // deferral only guards against a future batching/transition change making
      // that untrue.
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
    // Centre on the opener when there is nothing remembered — a window that
    // appears at the OS default position reads as unrelated to the click that
    // produced it.
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

    // A blocked popup returns null. The panel STAYS DOCKED and the caller is
    // told — the one thing that must never happen is a click that appears to do
    // nothing while the dock quietly believes the panel left.
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

    // Fast path for the ordinary close/reload. `pagehide` rather than `unload`
    // because `unload` is unreliable under bfcache and is actively being
    // deprecated; a RELOAD of the popup also lands here, and re-docking is the
    // right answer for it — the reloaded document is blank and can never get its
    // nodes back, so the alternative is a permanently empty ghost window.
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
   * An opener that unloads must take its popups with it. A popup outliving its
   * opener still PAINTS — the DOM is real — but its reactive graph is gone, so
   * it is a frozen screenshot that looks live and accepts clicks that do
   * nothing. `beforeunload` fires for navigation, reload and close, which is the
   * full set of ways the opener's graph can die while the browser is healthy;
   * `pagehide` covers the bfcache path that `beforeunload` can skip. The popup's
   * own watchdog covers the rest — see ORPHAN_WATCHDOG_SOURCE.
   *
   * This deliberately does NOT reuse `finish`: that path defers `win.close()` to
   * a microtask so the panel's nodes can move home first, and the microtask
   * queue is not guaranteed to be drained once the document is unloading — the
   * close would simply never happen, which is the exact leak this handler
   * exists to prevent. Moving nodes home is pointless here anyway; the opener is
   * dying with them.
   */
  const onOpenerGone = (): void => {
    for (const [id, rec] of windows) {
      rec.closed = true;
      for (const step of rec.teardown.reverse()) step();
      writeGeometry(options.storageKey, id, rec.geometry);
      if (!rec.win.closed) rec.win.close();
    }
    windows.clear();
    // Matters only for the bfcache path, where `pagehide` fires and the page can
    // later be RESTORED: leaving ids in `tornOff` would come back as panels
    // marked torn-off with no window behind them.
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
 * Wrap a panel's content so it can be rendered into the dock OR into that
 * panel's window, without ever being rebuilt.
 *
 * There is exactly ONE `<Portal>` and its `mount` toggles — see (2). The two
 * wrappers this introduces are `display: contents` while docked, so they add no
 * box and no layout; they DO however appear in the selector chain, which is why
 * the two `.acc-content > .acc-group` rules in styles.css need widening. That
 * cost is accepted deliberately: the alternative (an inline branch swapped for a
 * Portal branch) re-evaluates the children on every tear-off and dock, throwing
 * away scroll position, text selection and in-flight edits — precisely what the
 * panel's keep-mounted-while-collapsed rule exists to preserve.
 */
/**
 * ⚠ EXPORTED BUT UNUSED — zero callers, and superseded by the mount-precedence
 * Portal in `AccordionPanel` (a popup outranks a flyout outranks the column, all
 * through one Portal). This one knows only about the popup, so a panel using it
 * could not also fly out.
 *
 * Kept as the narrow reference implementation for a consumer that wants tear-off
 * without auto-hide. Not on any path this control takes.
 */
export function TearOffOutlet(props: {
  id: string;
  api: TearOffController;
  children: JSX.Element;
}): JSX.Element {
  // Not reactive and does not need to be: the element is created with this
  // component and lives exactly as long. Portal reads `mount` inside an effect,
  // which runs after the ref has been filled.
  let host!: HTMLDivElement;

  const mount = (): HTMLElement => props.api.mountFor(props.id) ?? host;

  /**
   * Portal calls this with each container it creates — including the new one it
   * builds when `mount` changes — so it is the natural place to make the
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
        // Set through the ref rather than as a JSX attribute so the attribute
        // name stays the single named constant the CSS note refers to.
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
