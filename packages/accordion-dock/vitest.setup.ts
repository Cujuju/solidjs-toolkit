/**
 * jsdom fills for the two APIs this control measures with. STUBS, not polyfills: jsdom has no
 * layout engine, so sizes come from explicit `getBoundingClientRect` stubs the test controls.
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
 * A real in-memory `Storage`. `localStorage` arrives here as a bare object with no Storage
 * methods, so persistence would no-op. See DESIGN_NOTES.md § vitest.setup.ts:34.
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
 * jsdom implements `MouseEvent` but not `PointerEvent`, and every drag here is pointer-based.
 * Subclassing rather than hand-rolling: the coordinate plumbing the resize engine reads is
 * MouseEvent's, already correct.
 */
class StubPointerEvent extends MouseEvent implements Partial<PointerEvent> {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    // Defaults match a primary mouse pointer. `railPan`/`autoHide` branch on `pointerType`,
        // so the default must be a real value rather than an empty string.
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = StubPointerEvent as unknown as typeof PointerEvent;
}

/**
 * jsdom implements rAF on a ~16ms timer. Run as a macrotask instead — still asynchronous,
 * since the measure pass must stay after the render pass — just not wall-clock bound.
 */
globalThis.requestAnimationFrame = ((fn: FrameRequestCallback): number =>
  setTimeout(() => fn(performance.now()), 0) as unknown as number) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: number): void => {
  clearTimeout(id as unknown as NodeJS.Timeout);
}) as typeof cancelAnimationFrame;

/**
 * The POPOVER API, stubbed. jsdom 24 implements neither `showPopover` nor top-layer behaviour,
 * so any test opening a flyout threw. See DESIGN_NOTES.md § vitest.setup.ts:133.
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
