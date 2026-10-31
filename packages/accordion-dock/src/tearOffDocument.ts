import { DelegatedEvents, delegateEvents } from 'solid-js/web';

import { TEAR_OFF_ORPHAN_WATCHDOG_MS } from './tearOffModel';
/** Marks the style nodes THIS module put in the popup head, so a re-sync can
 *  replace exactly those and leave anything else alone. */
const TEAR_OFF_STYLE_MARKER_ATTR = 'data-acc-tearoff-style';

/** Style nodes worth mirroring: `<style>` in dev, `<link rel=stylesheet>` in prod. See DESIGN_NOTES.md § src/tearOff.tsx:160. */
const STYLE_NODE_SELECTOR = 'style, link[rel~="stylesheet"]';

/** Runs INSIDE the popup, surviving an opener death `beforeunload` cannot cover. See DESIGN_NOTES.md § src/tearOff.tsx:167. */
const ORPHAN_WATCHDOG_SOURCE = `(function () {
  setInterval(function () {
    if (!window.opener || window.opener.closed) window.close();
  }, ${TEAR_OFF_ORPHAN_WATCHDOG_MS});
})();`;

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
    for (const stale of Array.from(
      target.head.querySelectorAll(`[${TEAR_OFF_STYLE_MARKER_ATTR}]`),
    )) {
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
    mirrorCustomProperties(source.documentElement, target.documentElement);
    mirrorCustomProperties(source.body, target.body);
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

/** Custom properties are author-declared with this prefix (CSS Variables §2). */
const CUSTOM_PROPERTY_PREFIX = '--';

/**
 * Mirror inline custom properties (theme variables set on `style`), which `TARGET_OWNED_ATTRS`
 * skips. Only `--*` declarations move; the target's own layout declarations stay.
 */
function mirrorCustomProperties(from: HTMLElement, to: HTMLElement): void {
  const names = (el: HTMLElement): string[] =>
    Array.from(el.style).filter((name) => name.startsWith(CUSTOM_PROPERTY_PREFIX));
  const fromNames = names(from);
  for (const name of names(to)) {
    if (!fromNames.includes(name)) to.style.removeProperty(name);
  }
  for (const name of fromNames) {
    const value = from.style.getPropertyValue(name);
    const priority = from.style.getPropertyPriority(name);
    if (
      to.style.getPropertyValue(name) !== value ||
      to.style.getPropertyPriority(name) !== priority
    ) {
      to.style.setProperty(name, value, priority);
    }
  }
}

/**
 * Bring a blank popup document up to hosting a panel. Returns teardown steps newest-first, so
 * the close path is the exact inverse rather than a second list.
 */
export function prepareDocument(win: Window, title: string): Array<() => void> {
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
