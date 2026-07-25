import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { createRoot } from 'solid-js';
import {
  createTearOff,
  TEAR_OFF_MIN_WINDOW_PX,
  type TearOffController,
} from '../tearOff';

/**
 * Tear-off, smoke-tested against a stubbed `window.open`.
 *
 * WHAT THIS DOES AND DOES NOT PROVE
 *
 * It proves the WIRING: that a tear-off opens a window and flips the signal, that
 * a blocked popup leaves the panel docked, that every route home funnels through
 * one close path, that geometry round-trips through storage, and that an opener
 * unloading takes its popups with it. Those are the parts that can be wrong in a
 * way no typechecker sees, and until now the whole module had never been executed
 * at all — not by a test and not by a user, because no demo card set
 * `tearOffable`, so the button that calls it did not render anywhere.
 *
 * It does NOT prove the cross-document rendering works. Whether a Portal's nodes
 * survive being re-parented into a real popup document, whether cloned stylesheets
 * paint there, and whether delegated events fire in a foreign document are all
 * properties of a real browser engine. jsdom has no rendering, so a green run here
 * is necessary and not sufficient — the browser check is still owed.
 */

/** Minimum window extent the geometry sampler will accept. Anything smaller is
 *  treated as a browser reporting garbage mid-open, so the sample is discarded. */
const BELOW_MIN_PX = TEAR_OFF_MIN_WINDOW_PX - 1;

const STORAGE_KEY = 'accTest:tearOff';

interface FakeWindow {
  document: Document;
  closed: boolean;
  close: () => void;
  focus: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  /** Fire a listener the controller registered on the popup. */
  emit: (type: string) => void;
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
}

function fakeWindow(): FakeWindow {
  // A REAL document, not a mock: `prepareDocument` appends a <base>, sets the
  // title, styles the body, clones stylesheets and installs a script element. A
  // stub with fake head/body would pass while telling us nothing about whether
  // those steps work on a document.
  const doc = document.implementation.createHTMLDocument('');
  const listeners = new Map<string, Set<() => void>>();
  return {
    document: doc,
    closed: false,
    close(): void {
      this.closed = true;
    },
    focus: vi.fn(),
    addEventListener: (type, fn) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
    emit: (type) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    screenX: 100,
    screenY: 120,
    outerWidth: 640,
    outerHeight: 480,
  };
}

let opened: FakeWindow[] = [];
/** Typed against `window.open`'s own signature — a looser `ReturnType<typeof
 *  vi.spyOn>` will not accept `mockReturnValue(null)`, which is the whole
 *  blocked-popup case. */
let openSpy: MockInstance<typeof window.open>;
/** Feature strings passed to `window.open`, for the geometry assertions. */
let features: string[] = [];

function mountController(
  overrides: Partial<Parameters<typeof createTearOff>[0]> = {},
): { api: TearOffController; dispose: () => void } {
  let api!: TearOffController;
  let dispose = (): void => {};
  createRoot((d) => {
    dispose = d;
    api = createTearOff({
      titleOf: (id) => `Panel ${id}`,
      storageKey: STORAGE_KEY,
      ...overrides,
    });
  });
  return { api, dispose };
}

beforeEach(() => {
  opened = [];
  features = [];
  localStorage.clear();
  openSpy = vi.spyOn(window, 'open').mockImplementation(((
    _url?: string | URL,
    _name?: string,
    feat?: string,
  ) => {
    features.push(feat ?? '');
    const w = fakeWindow();
    opened.push(w);
    return w as unknown as Window;
  }) as typeof window.open);
});

afterEach(() => {
  openSpy.mockRestore();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('createTearOff — opening', () => {
  it('opens a window and reports the panel torn off', () => {
    const { api, dispose } = mountController();
    const result = api.tearOff('files');

    expect(result).toEqual({ ok: true });
    expect(opened).toHaveLength(1);
    expect(api.isTornOff('files')).toBe(true);
    expect(api.tornOff()).toEqual(['files']);
    dispose();
  });

  it('prepares the popup document — title, base, body frame', () => {
    const { api, dispose } = mountController();
    api.tearOff('files');
    const doc = opened[0].document;

    // The OS window chrome is a torn-off panel's only label.
    expect(doc.title).toBe('Panel files');
    expect(doc.querySelector('base')).not.toBeNull();
    dispose();
  });

  it('leaves the popup body carrying the panel FRAME', () => {
    // Regression: `syncStyles` mirrors the opener's root attributes onto the
    // popup, and its reconciliation loop removed any attribute the opener lacked
    // — including `style`. Since a normal page's <body> has no inline style, the
    // frame set moments earlier in `prepareDocument` was wiped, leaving a panel
    // that did not fill its window inside a document that scrolled.
    //
    // `0px` not `0`: the CSSOM normalises the shorthand on read.
    const { api, dispose } = mountController();
    api.tearOff('files');
    const style = opened[0].document.body.style;

    expect(style.margin).toBe('0px');
    expect(style.height).toBe('100vh');
    expect(style.overflow).toBe('hidden');
    expect(style.display).toBe('flex');
    expect(style.flexDirection).toBe('column');
    dispose();
  });

  it('still carries the opener’s theme signals across', () => {
    // The frame fix must not disable the mirror it lives in: cloned CSS keys off
    // these, and a popup styled in the wrong theme reads as a bug.
    document.body.setAttribute('data-theme', 'dark');
    document.body.classList.add('probe-theme');
    try {
      const { api, dispose } = mountController();
      api.tearOff('files');
      const body = opened[0].document.body;

      expect(body.getAttribute('data-theme')).toBe('dark');
      expect(body.classList.contains('probe-theme')).toBe(true);
      dispose();
    } finally {
      document.body.removeAttribute('data-theme');
      document.body.classList.remove('probe-theme');
    }
  });

  it('hands back the popup body as the mount, and nothing while docked', () => {
    const { api, dispose } = mountController();
    expect(api.mountFor('files')).toBeUndefined();

    api.tearOff('files');
    expect(api.mountFor('files')).toBe(opened[0].document.body);

    api.dock('files');
    expect(api.mountFor('files')).toBeUndefined();
    dispose();
  });

  it('fires onTearOff', () => {
    const onTearOff = vi.fn();
    const { api, dispose } = mountController({ onTearOff });
    api.tearOff('files');
    expect(onTearOff).toHaveBeenCalledWith('files');
    dispose();
  });

  it('re-tearing an already-torn panel focuses it instead of opening a second window', () => {
    const { api, dispose } = mountController();
    api.tearOff('files');
    const result = api.tearOff('files');

    // Narrowed rather than asserted through: `TearOffResult` is a discriminated
    // union, and reading `.reason` off the success arm should not typecheck.
    expect(result).toEqual({ ok: false, reason: 'already-torn-off' });
    expect(opened).toHaveLength(1);
    expect(opened[0].focus).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('tears several panels into independent windows', () => {
    const { api, dispose } = mountController();
    api.tearOff('a');
    api.tearOff('b');
    expect(api.tornOff()).toEqual(['a', 'b']);
    expect(opened).toHaveLength(2);
    expect(opened[0].document).not.toBe(opened[1].document);
    dispose();
  });
});

describe('createTearOff — a blocked popup', () => {
  it('leaves the panel DOCKED and reports why', () => {
    // The one thing that must never happen is a click that appears to do nothing
    // while the dock quietly believes the panel left.
    openSpy.mockReturnValue(null);
    const onError = vi.fn();
    const { api, dispose } = mountController({ onError });

    const result = api.tearOff('files');
    expect(result).toEqual({ ok: false, reason: 'popup-blocked' });
    expect(api.isTornOff('files')).toBe(false);
    expect(api.tornOff()).toEqual([]);
    expect(onError).toHaveBeenCalledWith('files', 'popup-blocked');
    dispose();
  });

  it('does not fire onTearOff when the popup was blocked', () => {
    openSpy.mockReturnValue(null);
    const onTearOff = vi.fn();
    const { api, dispose } = mountController({ onTearOff });
    api.tearOff('files');
    expect(onTearOff).not.toHaveBeenCalled();
    dispose();
  });
});

describe('createTearOff — coming home', () => {
  it('dock() clears the signal and closes the window', async () => {
    const { api, dispose } = mountController();
    api.tearOff('files');
    api.dock('files');

    expect(api.isTornOff('files')).toBe(false);
    // Deferred to a microtask so the Portal's nodes move home while the popup
    // document is still healthy.
    expect(opened[0].closed).toBe(false);
    await Promise.resolve();
    expect(opened[0].closed).toBe(true);
    dispose();
  });

  it('dock() on a docked panel is a no-op', () => {
    const { api, dispose } = mountController();
    expect(() => api.dock('never-torn')).not.toThrow();
    expect(api.tornOff()).toEqual([]);
    dispose();
  });

  it('the user closing the popup docks the panel', () => {
    // `pagehide` is the fast path — it also covers a RELOAD of the popup, where
    // the reloaded document is blank and can never get its nodes back.
    const { api, dispose } = mountController();
    api.tearOff('files');
    opened[0].emit('pagehide');
    expect(api.isTornOff('files')).toBe(false);
    dispose();
  });

  it('fires onDock for BOTH causes — its own call and the user closing', () => {
    const onDock = vi.fn();
    const { api, dispose } = mountController({ onDock });

    api.tearOff('a');
    api.dock('a');
    api.tearOff('b');
    opened[1].emit('pagehide');

    expect(onDock.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    dispose();
  });

  it('docks only once when the window reports closing twice', () => {
    // pagehide and the close poll can both fire for one close; `finish` guards
    // on rec.closed so the second is a no-op.
    const onDock = vi.fn();
    const { api, dispose } = mountController({ onDock });
    api.tearOff('files');
    opened[0].emit('pagehide');
    opened[0].emit('pagehide');
    expect(onDock).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('dockAll brings every panel home', async () => {
    const { api, dispose } = mountController();
    api.tearOff('a');
    api.tearOff('b');
    api.dockAll();

    expect(api.tornOff()).toEqual([]);
    await Promise.resolve();
    expect(opened.map((w) => w.closed)).toEqual([true, true]);
    dispose();
  });
});

describe('createTearOff — geometry', () => {
  it('centres a first-time window on the opener', () => {
    const { api, dispose } = mountController();
    api.tearOff('files');
    // A window at the OS default position reads as unrelated to the click that
    // produced it.
    expect(features[0]).toMatch(/width=\d+/);
    expect(features[0]).toMatch(/height=\d+/);
    expect(features[0]).toMatch(/left=-?\d+/);
    expect(features[0]).toMatch(/top=-?\d+/);
    dispose();
  });

  it('round-trips geometry through storage so a re-tear reopens where it was', () => {
    const { api, dispose } = mountController();
    api.tearOff('files');
    // Moved and resized by the user, then docked immediately — inside the 400ms
    // poll interval, so only the final sample taken by `finish` can catch it.
    // Without that sample the panel reopened at its PREVIOUS position and the
    // user's last adjustment was the one change that did not stick.
    opened[0].outerWidth = 700;
    opened[0].outerHeight = 500;
    opened[0].screenX = 321;
    opened[0].screenY = 234;
    api.dock('files');
    dispose();

    const second = mountController();
    second.api.tearOff('files');
    expect(features[1]).toContain('width=700');
    expect(features[1]).toContain('height=500');
    expect(features[1]).toContain('left=321');
    expect(features[1]).toContain('top=234');
    second.dispose();
  });

  it('discards a nonsense sample rather than persisting it', () => {
    // A browser can report a degenerate size mid-open; remembering it would
    // reopen the panel as an unusable sliver next session.
    const { api, dispose } = mountController();
    api.tearOff('files');
    const before = localStorage.getItem(`${STORAGE_KEY}:files`);
    opened[0].outerWidth = BELOW_MIN_PX;
    opened[0].outerHeight = BELOW_MIN_PX;
    api.dock('files');

    const after = localStorage.getItem(`${STORAGE_KEY}:files`);
    expect(after).not.toContain(`"width":${BELOW_MIN_PX}`);
    expect(before === null || after !== null).toBe(true);
    dispose();
  });

  it('persists nothing when no storageKey is given', () => {
    const { api, dispose } = mountController({ storageKey: undefined });
    api.tearOff('files');
    api.dock('files');
    expect(localStorage.length).toBe(0);
    dispose();
  });
});

describe('createTearOff — the opener dying', () => {
  it('closes every popup when the opener unloads', () => {
    // A popup outliving its opener still PAINTS, but its reactive graph is gone —
    // a frozen screenshot that looks live and accepts clicks that do nothing.
    const { api, dispose } = mountController();
    api.tearOff('a');
    api.tearOff('b');

    window.dispatchEvent(new Event('pagehide'));
    expect(opened.map((w) => w.closed)).toEqual([true, true]);
    dispose();
  });

  it('disposing the group brings every panel home', () => {
    const { api, dispose } = mountController();
    api.tearOff('a');
    dispose();
    expect(api.tornOff()).toEqual([]);
  });
});
