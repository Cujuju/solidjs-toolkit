import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@solidjs/testing-library';
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
    expect(h.rowEl('r3')).toBe(el);
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
});
