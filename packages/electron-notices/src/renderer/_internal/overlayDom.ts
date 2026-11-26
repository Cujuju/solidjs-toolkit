import type { Rect } from '../../placement.js';

const OVERLAY_ROOT_ATTR = 'data-cuj-notices-overlay';
const overlayRootCounts = new WeakMap<Element, number>();

function acquireRoot(docEl: Element): void {
  const count = overlayRootCounts.get(docEl) ?? 0;
  if (count === 0) docEl.setAttribute(OVERLAY_ROOT_ATTR, '');
  overlayRootCounts.set(docEl, count + 1);
}

function releaseRoot(docEl: Element): void {
  const next = (overlayRootCounts.get(docEl) ?? 1) - 1;
  if (next <= 0) {
    overlayRootCounts.delete(docEl);
    docEl.removeAttribute(OVERLAY_ROOT_ATTR);
  } else {
    overlayRootCounts.set(docEl, next);
  }
}

/** Marks `el`'s document root while light-DOM connected (ref-counted). Tracks `el`'s current document; detached re-adoption into another document requires remounting. */
export function markOverlayRoot(el: HTMLElement): () => void {
  let activeDocEl: Element | null = null;
  let observedDoc: Document | null = null;
  const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => sync()) : null;
  const observeDoc = (doc: Document | null): void => {
    if (!observer || doc === observedDoc) return;
    observer.disconnect();
    observedDoc = doc;
    if (observedDoc) observer.observe(observedDoc, { childList: true, subtree: true });
  };
  const sync = (): void => {
    const doc = el.ownerDocument;
    observeDoc(doc);
    const nextDocEl = doc && el.getRootNode() === doc ? doc.documentElement : null;
    if (nextDocEl === activeDocEl) return;
    if (activeDocEl) releaseRoot(activeDocEl);
    activeDocEl = nextDocEl;
    if (activeDocEl) acquireRoot(activeDocEl);
  };
  sync();
  return () => {
    observer?.disconnect();
    observedDoc = null;
    if (activeDocEl) {
      releaseRoot(activeDocEl);
      activeDocEl = null;
    }
  };
}

/** Reports size and optionally the visible card rectangles in window coordinates. */
export function watchSize(el: HTMLElement, report: (width: number, height: number, rects?: Rect[]) => void, selector?: string): () => void {
  let last = '';
  const measure = () => {
    const { width, height } = el.getBoundingClientRect();
    const surfaces = selector ? Array.from(el.querySelectorAll(selector)) : [];
    const rects = selector ? surfaces.map((surface) => {
      const { x, y, width: w, height: h } = surface.getBoundingClientRect();
      return { x, y, width: w, height: h };
    }) : undefined;
    const size = [Math.ceil(width), Math.ceil(height)] as const;
    const next = JSON.stringify([size, rects]);
    if (next !== last) {
      last = next;
      report(...size, rects);
    }
  };
  // A hidden window never paints, so ResizeObserver stays silent; DOM changes still report, so the next notice shows it.
  const mutations = new MutationObserver(measure);
  mutations.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  // Size changes from CSS alone (hover), while visible.
  const resizes = new ResizeObserver(measure);
  resizes.observe(el);
  if (selector) el.addEventListener('scroll', measure, { passive: true });
  measure();
  return () => {
    mutations.disconnect();
    resizes.disconnect();
    if (selector) el.removeEventListener('scroll', measure);
  };
}

/** Calls `report` when the pointer enters or leaves anything matching `selector`; returns a stop function. */
export function watchPointer(selector: string, report: (over: boolean) => void): () => void {
  let over = false;
  const track = (target: EventTarget | null) => {
    const now = target instanceof Element && target.closest(selector) !== null;
    if (now === over) return;
    over = now;
    report(now);
  };
  const onMove = (e: MouseEvent) => track(e.target);
  const onLeave = () => track(null);
  document.addEventListener('mousemove', onMove);
  document.documentElement.addEventListener('mouseleave', onLeave);
  return () => {
    document.removeEventListener('mousemove', onMove);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    if (over) {
      over = false;
      report(false);
    }
  };
}

/** Local clock time of a notice. */
export const clockTime = (at: number): string => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Whether the notice with `id` is rendered under `root` (its element carries data-notice-id). */
export const hasNoticeElement = (root: HTMLElement, id: number): boolean => root.querySelector(`[data-notice-id="${id}"]`) !== null;
