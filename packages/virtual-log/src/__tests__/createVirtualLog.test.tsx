import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { installFakes, mount, rowsOf } from './harness';

beforeEach(installFakes);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createVirtualLog', () => {
  it('draws the newest rows at the bottom, measured on mount', async () => {
    const h = mount(rowsOf(100, 20), { estimateSize: 10 });
    await h.flush();
    expect(h.drawn().at(-1)).toBe('r99');
    expect(h.drawn()).not.toContain('r0');
    expect(h.log().startOf('r98')).toBe(20);
    // Rows drawn so far are measured at 20 (and keep it once undrawn); the rest are still estimated at 10.
    expect(h.log().extent()).toBeGreaterThan(1000);
    expect(h.log().extent()).toBeLessThan(2000);
  });

  it('never writes the offset while a touch is down: the correction goes to shift, then one write at rest', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    h.userScrollTo(500);
    await h.settle();
    h.writes.length = 0;
    h.touch('touchstart', 1);
    // r80 is drawn below the view (380-400 from the bottom; view is 500-600) and grows by 30.
    h.resize({ r80: 50 });
    expect(h.writes).toEqual([]);
    expect(h.log().shift()).toBe(30);
    expect(h.log().distanceFromBottom()).toBe(530);
    h.touch('touchend', 0);
    await h.settle();
    expect(h.writes).toEqual([530]);
    expect(h.log().shift()).toBe(0);
  });

  it('at rest, a row growing below the view is compensated with a write', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    h.userScrollTo(500);
    await h.settle();
    h.writes.length = 0;
    h.resize({ r80: 50 });
    expect(h.writes).toEqual([530]);
    expect(h.log().shift()).toBe(0);
  });

  it('a row growing above the view moves nothing', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    h.userScrollTo(500);
    await h.settle();
    h.writes.length = 0;
    // r60 spans 780-800: above the view's top edge (600).
    h.resize({ r60: 80 });
    expect(h.writes).toEqual([]);
  });

  it('its own writes do not count as the user scrolling', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    h.userScrollTo(500);
    await h.settle();
    h.resize({ r80: 50 });
    h.scroller().dispatchEvent(new Event('scroll'));
    expect(h.log().isScrolling()).toBe(false);
  });

  it('a new newest row while reading history keeps the view still', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    h.userScrollTo(500);
    await h.settle();
    h.writes.length = 0;
    h.setRows([...h.rows(), { key: 'new', h: 20 }]);
    await h.flush();
    expect(h.native()).toBe(520);
  });

  it('following at the bottom, a new row shows with no write', async () => {
    const h = mount(rowsOf(100, 20), { following: () => true });
    await h.flush();
    h.writes.length = 0;
    h.setRows([...h.rows(), { key: 'new', h: 20 }]);
    await h.flush();
    expect(h.writes).toEqual([]);
    expect(h.native()).toBe(0);
    expect(h.drawn().at(-1)).toBe('new');
  });

  it('following at the bottom, a viewport resize mid-touch that leaves the offset short goes back to the bottom at rest', async () => {
    const h = mount(rowsOf(100, 20), { following: () => true });
    await h.flush();
    h.touch('touchstart', 1);
    // The keyboard closing: the scroller grows and the engine lands the offset above the bottom.
    h.scroller().scrollTop = -30;
    h.resizeView(140);
    expect(h.log().distanceFromBottom()).toBe(30);
    expect(h.native()).toBe(30);
    h.touch('touchend', 0);
    await h.settle();
    expect(h.log().distanceFromBottom()).toBe(0);
    expect(h.native()).toBe(0);
  });

  it('a touch after such a resize keeps the view where the user left it', async () => {
    const h = mount(rowsOf(100, 20), { following: () => true });
    await h.flush();
    h.touch('touchstart', 1);
    h.scroller().scrollTop = -30;
    h.resizeView(140);
    h.touch('touchend', 0);
    h.touch('touchstart', 1);
    h.touch('touchend', 0);
    await h.settle();
    expect(h.log().distanceFromBottom()).toBe(30);
  });

  it('a resize mid-touch away from the bottom keeps the view', async () => {
    const h = mount(rowsOf(100, 20), { following: () => false });
    await h.flush();
    h.userScrollTo(500);
    await h.settle();
    h.touch('touchstart', 1);
    h.scroller().scrollTop = -530;
    h.resizeView(140);
    h.touch('touchend', 0);
    await h.settle();
    expect(h.log().distanceFromBottom()).toBe(530);
  });

  it('holdRow centers a row and keeps it centered as it is measured, until the user scrolls', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    expect(h.log().holdRow('r50')).toBe(true);
    // r50 spans 980-1000: centered, L = 990 - 50.
    expect(h.native()).toBe(940);
    await h.flush();
    h.resize({ r60: 40 });
    expect(h.native()).toBe(960);
    h.scroller().dispatchEvent(new Event('wheel'));
    expect(h.log().holding()).toBe(false);
    expect(h.log().holdRow('nope')).toBe(false);
  });

  it('scrollToKey brings a far row in and refines it once measured', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    expect(h.log().scrollToKey('r10')).toBe(true);
    await h.flush();
    // r10 spans 1780-1800 measured; auto aligns its top with the view's top.
    expect(h.native()).toBe(1700);
    expect(h.log().scrollToKey('nope')).toBe(false);
  });

  it('loads older rows near the top, once at a time', async () => {
    let calls = 0;
    let resolve!: () => void;
    const h = mount(rowsOf(30, 20), {
      loadOlder: () => {
        calls++;
        return new Promise<void>((r) => (resolve = r));
      },
    });
    await h.flush();
    h.userScrollTo(400);
    h.userScrollTo(450);
    expect(calls).toBe(1);
    h.setRows([...rowsOf(30, 20, 'o'), ...h.rows()]);
    resolve();
    await h.flush();
  });

  it('reserves a runway above the oldest row while older rows remain', async () => {
    const h = mount(rowsOf(10, 20), { hasOlder: () => true, runwayPx: 300 });
    await h.flush();
    expect(h.log().extent()).toBe(500);
    expect(h.log().distanceFromTop()).toBeGreaterThan(0);
  });

  it('keeps a row element across prepends and appends', async () => {
    const h = mount(rowsOf(5, 20));
    await h.flush();
    const el = h.rowEl('r3');
    h.setRows([{ key: 'old', h: 20 }, ...h.rows(), { key: 'new', h: 20 }]);
    await h.flush();
    expect(h.rowEl('r3') === el).toBe(true);
    expect(h.drawn()).toEqual(['old', 'r0', 'r1', 'r2', 'r3', 'r4', 'new']);
  });

  it('keyboard: one Tab stop on the newest row in view; arrows move between rows', async () => {
    const h = mount(rowsOf(20, 20));
    await h.flush();
    const tabbable = () => h.drawn().filter((k) => h.rowEl(k!)!.tabIndex === 0);
    expect(tabbable()).toEqual(['r19']);
    h.rowEl('r19')!.focus();
    h.rowEl('r19')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await h.flush();
    expect(document.activeElement).toBe(h.rowEl('r18'));
    expect(tabbable()).toEqual(['r18']);
  });

  describe('review regressions', () => {
    it('a settle that commits a shift larger than the drawn range keeps every on-screen row element', async () => {
      const h = mount(rowsOf(100, 20));
      await h.flush();
      h.userScrollTo(500);
      await h.settle();
      const onScreen = ['r70', 'r71', 'r72', 'r73', 'r74'];
      const before = onScreen.map((k) => h.rowEl(k));
      const at = () => h.log().startOf('r72') - h.log().distanceFromBottom();
      const was = at();
      h.touch('touchstart', 1);
      h.resize({ r80: 320, r81: 320, r82: 320, r83: 320 });
      expect(h.log().shift()).toBe(1200);
      h.touch('touchend', 0);
      await h.settle();
      expect(h.log().shift()).toBe(0);
      // Settling also rescales estimates (measured rows ran large): the offset differs, the view does not.
      expect(at()).toBeCloseTo(was, 6);
      // The same nodes, not equal ones: a recreated row reloads its media.
      expect(onScreen.map((k, i) => h.rowEl(k) === before[i])).toEqual([true, true, true, true, true]);
    });

    it('a finger resting on the log, however long, gets no write', async () => {
      const h = mount(rowsOf(100, 20));
      await h.flush();
      h.userScrollTo(500);
      await h.settle();
      h.writes.length = 0;
      h.touch('touchstart', 1);
      await vi.advanceTimersByTimeAsync(3000);
      h.resize({ r80: 50 });
      await vi.advanceTimersByTimeAsync(3000);
      expect(h.writes).toEqual([]);
    });

    it('hidden, rows measuring 0 keep their sizes', async () => {
      const h = mount(rowsOf(100, 20));
      await h.flush();
      h.userScrollTo(500);
      await h.settle();
      const start = h.log().startOf('r70');
      h.resizeView(0, 0);
      h.resize({ r70: 0, r71: 0, r72: 0, r80: 0 });
      h.resizeView(100, 300);
      await h.flush();
      expect(h.log().startOf('r70')).toBe(start);
      expect(h.native()).toBe(500);
    });

    it('the top is reported only once the runway is gone from the committed extent', async () => {
      const [hasOlder, setHasOlder] = createSignal(true);
      const h = mount(rowsOf(10, 20), { hasOlder, runwayPx: 300 });
      await h.flush();
      h.userScrollTo(400);
      await h.settle();
      h.touch('touchstart', 1);
      setHasOlder(false);
      expect(h.log().distanceFromTop()).toBeGreaterThanOrEqual(1);
      h.touch('touchend', 0);
      await h.settle();
      expect(h.log().extent()).toBe(200);
      expect(h.log().distanceFromTop()).toBeLessThanOrEqual(0);
    });

    it('a jump measured at exactly its estimate stops refining: a later scroll is not pulled back', async () => {
      const h = mount(rowsOf(100, 20));
      await h.flush();
      h.log().scrollToKey('r10');
      await h.flush();
      h.userScrollTo(900);
      await h.settle();
      expect(h.native()).toBe(900);
    });

    it('following, mid-scroll the newest row holds its place: growth pushes content up, with no correction to snap later', async () => {
      const h = mount(rowsOf(100, 20), { following: () => true });
      await h.flush();
      h.touch('touchstart', 1);
      h.userScrollTo(50);
      h.resize({ r97: 50 });
      expect(h.log().shift()).toBe(0);
      expect(h.log().distanceFromBottom()).toBe(50);
      h.touch('touchend', 0);
      h.writes.length = 0;
      await h.settle();
      // Nothing was held, so nothing moves at rest: the view stays where the user left it.
      expect(h.writes).toEqual([]);
      expect(h.native()).toBe(50);
    });

    it('reports the user scroll delta, and 0 for its own writes', async () => {
      const h = mount(rowsOf(100, 20));
      await h.flush();
      h.userScrollTo(100);
      expect(h.log().lastScrollDelta()).toBe(100);
      await h.settle();
      h.resize({ r96: 50 });
      h.scroller().dispatchEvent(new Event('scroll'));
      expect(h.log().lastScrollDelta()).toBe(0);
    });

    it('replacing every row opens the new log at its newest row', async () => {
      const h = mount(rowsOf(100, 20));
      await h.flush();
      h.userScrollTo(500);
      await h.settle();
      h.setRows(rowsOf(100, 20, 'x'));
      await h.flush();
      expect(h.native()).toBe(0);
    });
  });

  it('loads newer rows as the bottom nears while hasNewer, once at a time', async () => {
    let calls = 0;
    const h = mount(rowsOf(100, 20), { hasNewer: () => true, loadNewer: () => (calls++, new Promise<void>(() => {})) });
    await h.flush();
    // At the bottom of the loaded rows: near.
    expect(calls).toBe(1);
    h.userScrollTo(10);
    h.userScrollTo(20);
    expect(calls).toBe(1);
  });

  it('does not load newer rows far from the bottom, or without hasNewer', async () => {
    let calls = 0;
    const [hasNewer, setHasNewer] = createSignal(false);
    const h = mount(rowsOf(100, 20), { hasNewer, loadNewer: async () => void calls++ });
    await h.flush();
    h.userScrollTo(1500);
    setHasNewer(true);
    h.userScrollTo(1490);
    expect(calls).toBe(0);
    h.userScrollTo(100);
    expect(calls).toBe(1);
  });

  it('while newer rows remain, rows added below mid-scroll take the bottom runway: no shift, and an invisible refill at rest', async () => {
    const h = mount(rowsOf(50, 20), { hasNewer: () => true, loadNewer: () => new Promise<void>(() => {}), runwayPx: 300 });
    await h.flush();
    h.log().scrollToBottom();
    expect(h.native()).toBe(300);
    h.userScrollTo(600);
    await h.settle();
    const view = () => h.log().startOf('r20') - (h.native() + h.log().shift());
    const top = view();
    h.touch('touchstart', 1);
    h.setRows([...h.rows(), ...rowsOf(10, 20, 'n')]);
    await h.flush();
    expect(h.log().shift()).toBe(0);
    expect(view()).toBe(top);
    h.touch('touchend', 0);
    h.writes.length = 0;
    await h.settle();
    // Refilled: rows below grew the content by 200, so one write keeps the view where it was.
    expect(h.writes).toEqual([800]);
    expect(view()).toBe(top);
  });

  it('with a bottom runway, the newest loaded row is the bottom: following and distance agree', async () => {
    const h = mount(rowsOf(50, 20), { hasNewer: () => true, loadNewer: () => new Promise<void>(() => {}), runwayPx: 300, following: () => true });
    await h.flush();
    expect(h.native()).toBe(300);
    expect(h.log().distanceFromBottom()).toBe(0);
    h.resizeView(120);
    await h.flush();
    expect(h.log().distanceFromBottom()).toBe(0);
  });

  it('rows that arrive while hidden are placed by the anchor from before it hid', async () => {
    const h = mount(rowsOf(100, 20));
    await h.flush();
    h.userScrollTo(500);
    await h.settle();
    const view = () => h.log().startOf('r72') - (h.native() + h.log().shift());
    const was = view();
    h.resizeView(0, 0);
    h.setRows([...h.rows(), ...rowsOf(10, 20, 'n')]);
    await h.flush();
    h.resizeView(100, 300);
    await h.flush();
    expect(view()).toBe(was);
  });

  it('when one end finishes loading, the other end is checked again', async () => {
    let newerCalls = 0;
    let resolveOlder!: () => void;
    const h = mount(rowsOf(8, 20), {
      loadOlder: () => new Promise<void>((r) => (resolveOlder = r)),
      hasNewer: () => true,
      loadNewer: () => (newerCalls++, Promise.reject(new Error('busy'))),
    });
    await h.flush();
    const before = newerCalls;
    resolveOlder();
    await h.flush();
    expect(newerCalls).toBeGreaterThan(before);
  });
});
