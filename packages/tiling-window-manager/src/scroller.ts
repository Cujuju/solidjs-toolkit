/** The scroll container a workspace or handle sits in. */

const SCROLLING = new Set(['auto', 'scroll']);

/** The nearest ancestor that scrolls vertically, and its visible top and bottom. */
export function scrollerOf(el: HTMLElement): { el: Element; bounds: () => { top: number; bottom: number } } {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (SCROLLING.has(getComputedStyle(node).overflowY)) {
      const found = node;
      return { el: found, bounds: () => found.getBoundingClientRect() };
    }
  }
  return { el: document.scrollingElement ?? document.documentElement, bounds: () => ({ top: 0, bottom: window.innerHeight }) };
}
