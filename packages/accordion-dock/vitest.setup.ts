/**
 * jsdom fills for the two browser APIs this control measures with.
 *
 * Both are STUBS, not polyfills, and that distinction is the point: jsdom has no
 * layout engine, so a faithful ResizeObserver is impossible — nothing would ever
 * resize. What the tests need is for the observing code to run without throwing,
 * while the SIZES come from explicit `getBoundingClientRect` stubs the test
 * controls. That keeps every fit assertion driven by numbers the test states out
 * loud, instead of by whatever jsdom happens to report (which is zero for
 * everything).
 */

/** Minimal ResizeObserver. Records observed elements so a test can assert wiring,
 *  and never fires — a callback here would be reporting a resize that did not
 *  happen. */
class StubResizeObserver implements ResizeObserver {
  readonly observed = new Set<Element>();
  constructor(_callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.observed.add(target);
  }
  unobserve(target: Element): void {
    this.observed.delete(target);
  }
  disconnect(): void {
    this.observed.clear();
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
}

/**
 * A real in-memory `Storage`.
 *
 * `localStorage` arrives in this environment as a bare object with none of the
 * Storage methods on it — `localStorage.clear` is not a function — so anything
 * that persists (the group's layout, tear-off window geometry) would either throw
 * or silently no-op behind the modules' own try/catch. Silently is the dangerous
 * one: a persistence test would pass by never persisting.
 *
 * Implemented rather than mocked, because the behaviour under test IS the
 * round-trip. A `vi.fn()` pair would assert that the module called setItem, not
 * that what it wrote can be read back — and the geometry round-trip is exactly a
 * write-then-read across two controller lifetimes.
 */
class MemoryStorage implements Storage {
  #map = new Map<string, string>();

  get length(): number {
    return this.#map.size;
  }
  clear(): void {
    this.#map.clear();
  }
  getItem(key: string): string | null {
    return this.#map.get(String(key)) ?? null;
  }
  // Storage stringifies both key and value — a test that stores a number and
  // reads back a number would be testing a Map, not Storage.
  setItem(key: string, value: string): void {
    this.#map.set(String(key), String(value));
  }
  removeItem(key: string): void {
    this.#map.delete(String(key));
  }
  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
}

if (typeof globalThis.localStorage?.clear !== 'function') {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

/**
 * jsdom implements `MouseEvent` but not `PointerEvent` — a long-standing gap, not
 * a version issue. Every drag gesture in this control (splitter resize, reorder,
 * rail pan) is built on pointer events precisely because they unify mouse, touch
 * and pen, so without this nothing draggable is testable at all.
 *
 * Subclassing `MouseEvent` rather than hand-rolling an object: the coordinate
 * plumbing the resize engine actually reads (`clientX`/`clientY`, `bubbles`,
 * `currentTarget` during dispatch) is MouseEvent's, already correct, and
 * re-implementing it would be re-implementing the part most likely to be wrong.
 * Only the pointer-specific fields are added on top.
 */
class StubPointerEvent extends MouseEvent implements Partial<PointerEvent> {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    // Defaults match a primary mouse pointer, which is what a test that does not
    // say otherwise means. `railPan`/`autoHide` branch on `pointerType`, so the
    // default has to be a real value rather than an empty string.
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = StubPointerEvent as unknown as typeof PointerEvent;
}

/**
 * jsdom implements rAF on a ~16ms timer. Tests that await a measure pass would
 * each pay that, so it runs as a macrotask instead — still asynchronous (the
 * measure pass MUST stay after the render pass, which is the whole reason
 * `createAfterPaint` is used), just not wall-clock bound.
 */
globalThis.requestAnimationFrame = ((fn: FrameRequestCallback): number =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: number): void => {
  clearTimeout(id as unknown as NodeJS.Timeout);
}) as typeof cancelAnimationFrame;

/**
 * The POPOVER API, stubbed.
 *
 * jsdom 24 implements neither `showPopover`/`hidePopover` nor the `[popover]`
 * top-layer behaviour, so any test that actually OPENS a flyout threw before
 * reaching its assertion — which is why auto-hide had no rendered-group coverage
 * at all until vertical needed some. The tell was that the only passing flyout
 * tests were the ones where no flyout opened.
 *
 * A STUB in the same sense as the ResizeObserver above: it makes the calls
 * succeed and keeps `:popover-open` answerable, without pretending to implement a
 * top layer jsdom has no way to paint. Tests here assert DOM STRUCTURE and group
 * STATE — that the panel is marked as flying out, that its header survives, that
 * its inline content host is hidden — none of which depend on the popover
 * actually being raised. Anything that genuinely needs the top layer belongs in a
 * browser test, which is where the horizontal flyout's own layering bug was
 * caught (see the header of `autoHide.css`).
 */
type PopoverElement = HTMLElement & { __popoverOpen?: boolean };

if (typeof HTMLElement !== 'undefined' && HTMLElement.prototype.showPopover === undefined) {
  HTMLElement.prototype.showPopover = function showPopover(this: PopoverElement): void {
    this.__popoverOpen = true;
  };
  HTMLElement.prototype.hidePopover = function hidePopover(this: PopoverElement): void {
    this.__popoverOpen = false;
  };
  HTMLElement.prototype.togglePopover = function togglePopover(
    this: PopoverElement,
    force?: boolean,
  ): boolean {
    this.__popoverOpen = force ?? !this.__popoverOpen;
    return this.__popoverOpen;
  };

  /* `matches(':popover-open')` throws on an unknown pseudo-class in jsdom, which
     turns a state query into a crash. Answer it from the flag above and delegate
     everything else to the real implementation. */
  const realMatches = Element.prototype.matches;
  Element.prototype.matches = function matches(this: PopoverElement, selector: string): boolean {
    if (selector.includes(':popover-open')) return this.__popoverOpen === true;
    return realMatches.call(this, selector);
  };
}
