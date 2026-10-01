import { test, expect, type Page } from '@playwright/test';

/**
 * The virtual log in real engines (Chromium and WebKit). jsdom has no layout or scrolling, so every check here is a
 * measured position on screen, or a scroll write timed against the user's own scrolling.
 */

declare global {
  interface Window {
    __writes: { t: number; v: number }[];
    __activity: { t: number; kind: string }[];
    __vlog: {
      isScrolling(): boolean;
      distanceFromBottom(): number;
      extent(): number;
      holding(): boolean;
    };
    __vlogCtl: { append(): void; olderDelayMs(ms: number): void; mediaDelayMs(ms: number): void; following(v: boolean): void };
  }
}

const SCROLLER = '[data-testid="vlog-scroller"]';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__writes = [];
    window.__activity = [];
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      get: desc.get,
      set(this: Element, v: number) {
        window.__writes.push({ t: performance.now(), v });
        desc.set!.call(this, v);
      },
      configurable: true,
    });
    for (const m of ['scrollTo', 'scrollBy', 'scroll'] as const) {
      const orig = Element.prototype[m] as (...a: unknown[]) => void;
      (Element.prototype as unknown as Record<string, unknown>)[m] = function (this: Element, ...a: unknown[]) {
        window.__writes.push({ t: performance.now(), v: NaN });
        orig.apply(this, a);
      };
    }
    for (const kind of ['wheel', 'scroll']) document.addEventListener(kind, () => window.__activity.push({ t: performance.now(), kind }), { capture: true, passive: true });
  });
  await page.goto('/#/virtual-log');
  await expect(page.locator(SCROLLER).locator('[data-msg]').first()).toBeVisible();
  // The first rows' media loads.
  await settled(page, 400);
});

/** Waits until the log is at rest and media has had time to load. */
async function settled(page: Page, extraMs = 0): Promise<void> {
  await page.waitForTimeout(extraMs);
  await page.waitForFunction(() => !window.__vlog.isScrolling());
  await page.waitForTimeout(50);
  await page.waitForFunction(() => !window.__vlog.isScrolling());
}

/** The row cut by the view's top edge, which the log holds still while reading history: its number and top. */
async function reference(page: Page): Promise<{ n: number; top: number }> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel)!.getBoundingClientRect();
    const mid = s.top + 1;
    const rows = [...document.querySelectorAll<HTMLElement>(`${sel} [data-msg]`)];
    const row = rows.find((r) => {
      const b = r.getBoundingClientRect();
      return b.top <= mid && b.bottom > mid;
    })!;
    return { n: Number(row.dataset['msg']), top: row.getBoundingClientRect().top };
  }, SCROLLER);
}

async function topOf(page: Page, n: number): Promise<number | null> {
  return page.evaluate(([sel, n]) => document.querySelector(`${sel} [data-msg="${n}"]`)?.getBoundingClientRect().top ?? null, [SCROLLER, n] as const);
}

async function wheelOver(page: Page, dy: number): Promise<void> {
  const box = (await page.locator(SCROLLER).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, dy);
}

/**
 * Scroll writes made while anything was scrolling, judged independently of the log's own busy flag: a write with a
 * wheel or scroll event in the 100ms before it. (A write's own scroll event comes after it.)
 */
async function writesDuringScrolling(page: Page): Promise<number> {
  return page.evaluate(() => window.__writes.filter((w) => window.__activity.some((a) => a.t <= w.t && w.t - a.t < 100)).length);
}

test('wheeling up through paging and loading media: the rows read move only by the wheel', async ({ page }) => {
  for (let i = 0; i < 25; i++) {
    const ref = await reference(page);
    await wheelOver(page, -150);
    await settled(page);
    const after = await topOf(page, ref.n);
    expect(after, `row ${ref.n} still drawn`).not.toBeNull();
    const moved = after! - ref.top;
    // The view may stop short at the top of the loaded rows, but never jumps past the wheel or backwards.
    expect(moved, `step ${i}: row ${ref.n} moved ${moved}`).toBeGreaterThanOrEqual(-1);
    expect(moved, `step ${i}: row ${ref.n} moved ${moved}`).toBeLessThanOrEqual(151);
    if (i < 20) expect(Math.abs(moved - 150), `step ${i}: row ${ref.n} moved ${moved}`).toBeLessThanOrEqual(1);
  }
  expect(await writesDuringScrolling(page)).toBe(0);
});

test('media loading below the view while reading history leaves the view still', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.mediaDelayMs(600));
  await wheelOver(page, -900);
  await settled(page);
  const ref = await reference(page);
  // Rows drawn in the overscan below the view load their media now.
  await page.waitForTimeout(900);
  await settled(page);
  expect(Math.abs((await topOf(page, ref.n))! - ref.top)).toBeLessThanOrEqual(1);
});

test('a new message while scrolled up leaves the view still', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.following(false));
  await wheelOver(page, -600);
  await settled(page);
  const ref = await reference(page);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.__vlogCtl.append());
  await settled(page, 500);
  expect(Math.abs((await topOf(page, ref.n))! - ref.top)).toBeLessThanOrEqual(1);
});

test('following at the newest row, a new message shows at the bottom', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.append());
  await settled(page, 400);
  expect(await page.evaluate(() => window.__vlog.distanceFromBottom())).toBeLessThanOrEqual(1);
  const gap = await page.evaluate((sel) => {
    const s = document.querySelector(sel)!.getBoundingClientRect();
    const last = document.querySelector(`${sel} [data-msg="2000"]`)!.getBoundingClientRect();
    return s.bottom - last.bottom;
  }, SCROLLER);
  // The end padding (12px) and the border.
  expect(gap).toBeGreaterThan(8);
  expect(gap).toBeLessThan(16);
});

test('a held row stays centered while rows around it load media', async ({ page }) => {
  await page.getByRole('button', { name: 'Hold an older row' }).click();
  await settled(page, 800);
  const off = await page.evaluate((sel) => {
    const s = document.querySelector(sel)!.getBoundingClientRect();
    const row = document.querySelector(`${sel} [data-msg="1920"]`)!.getBoundingClientRect();
    return row.top + row.height / 2 - (s.top + s.height / 2);
  }, SCROLLER);
  expect(Math.abs(off)).toBeLessThanOrEqual(1.5);
  expect(await page.evaluate(() => window.__vlog.holding())).toBe(true);
});

test('a fast fling upward runs on into older pages', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.olderDelayMs(150));
  const start = await page.evaluate(() => window.__vlog.extent());
  for (let i = 0; i < 30; i++) await wheelOver(page, -400);
  await settled(page, 300);
  for (let i = 0; i < 30; i++) await wheelOver(page, -400);
  await settled(page, 300);
  expect(await page.evaluate(() => window.__vlog.distanceFromBottom())).toBeGreaterThan(start);
});

test('arrow keys move focus between rows', async ({ page }) => {
  const newest = page.locator(`${SCROLLER} [data-row-key="m1999"]`);
  await newest.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(`${SCROLLER} [data-row-key="m1998"]`)).toBeFocused();
  await expect(page.locator(`${SCROLLER} [data-row-key="m1998"]`)).toHaveAttribute('tabindex', '0');
});

test('hiding the log (a tab switch, a folded panel) and showing it again keeps the reading position', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.following(false));
  await wheelOver(page, -1500);
  await settled(page, 300);
  const ref = await reference(page);
  await page.evaluate((sel) => ((document.querySelector(sel) as HTMLElement).style.display = 'none'), SCROLLER);
  await page.waitForTimeout(400);
  await page.evaluate((sel) => ((document.querySelector(sel) as HTMLElement).style.display = 'flex'), SCROLLER);
  await settled(page, 300);
  expect(Math.abs((await topOf(page, ref.n))! - ref.top)).toBeLessThanOrEqual(1);
});
