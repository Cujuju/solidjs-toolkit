import { test, expect, type Page } from '@playwright/test';
import { SCROLLER, clearFrames, startRecording, steps, stopRecording, untiled, type Frame } from './frameRecorder';

/**
 * Slow scrolling and reading still, while other people post, edit, delete and react, and media and older pages load.
 * A fast scroll hides a small pop inside its own large steps; at 1-2px a frame, or at rest, any movement the reader
 * didn't make shows. Every frame checked is a painted one.
 */

declare global {
  interface Window {
    __vlog: { isScrolling(): boolean; distanceFromBottom(): number; holdRow(key: string): boolean };
    __vlogCtl: {
      append(): void;
      following(v: boolean): void;
      edit(n: number, words: number): void;
      remove(n: number): void;
      loadOlder(): Promise<void>;
      mediaDelayMs(ms: number): void;
      olderDelayMs(ms: number): void;
      openAround(n: number): void;
    };
    __chaos?: number;
  }
}

test.use({ viewport: { width: 700, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/#/virtual-log');
  await expect(page.locator(`${SCROLLER} [data-msg]`).first()).toBeVisible();
  await page.waitForTimeout(500);
});

async function atRest(page: Page, extraMs = 0): Promise<void> {
  await page.waitForTimeout(extraMs);
  await page.waitForFunction(() => !window.__vlog.isScrolling(), undefined, { timeout: 10_000 });
}

/**
 * Other people, every `everyMs`: a new post (below the view when scrolled up), an edit growing or shrinking a row
 * above or below the view, a deletion below it. Never a row on screen, so nothing on screen has a reason to move.
 */
async function startChaos(page: Page, everyMs = 180): Promise<void> {
  await page.evaluate(
    ([sel, everyMs]) => {
      let tick = 0;
      window.__chaos = window.setInterval(() => {
        const s = document.querySelector(sel)!.getBoundingClientRect();
        const drawn = [...document.querySelectorAll<HTMLElement>(`${sel} [data-msg]`)].map((el) => ({ n: Number(el.dataset['msg']), b: el.getBoundingClientRect() }));
        // A margin past each edge: the row's own growth must stay off screen too.
        const above = drawn.filter((r) => r.b.bottom < s.top - 300).map((r) => r.n);
        const below = drawn.filter((r) => r.b.top > s.bottom + 300).map((r) => r.n);
        const pick = (xs: number[]): number | undefined => xs[(tick * 7) % Math.max(1, xs.length)];
        const ctl = window.__vlogCtl;
        switch (tick++ % 5) {
          case 0:
            ctl.append();
            break;
          case 1: {
            const n = pick(below);
            if (n !== undefined) ctl.edit(n, 60);
            break;
          }
          case 2: {
            const n = pick(above);
            if (n !== undefined) ctl.edit(n, 70);
            break;
          }
          case 3: {
            const n = pick(below);
            if (n !== undefined) ctl.remove(n);
            break;
          }
          case 4: {
            const n = pick(below);
            if (n !== undefined) ctl.edit(n, 2);
            break;
          }
        }
      }, everyMs);
    },
    [SCROLLER, everyMs] as const,
  );
}

const stopChaos = (page: Page): Promise<void> => page.evaluate(() => clearInterval(window.__chaos));

async function slowWheel(page: Page, dy: number, events: number): Promise<void> {
  const box = (await page.locator(SCROLLER).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < events; i++) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(16);
  }
}

/** Every on-screen row moves together, by no more than the input could, never against it. */
function expectRigid(fs: Frame[], dir: 'older' | 'newer' | 'still', maxStep: number, label: string): void {
  expect(untiled(fs), `${label}: frames with a gap, overlap or missing row`).toEqual([]);
  const s = steps(fs);
  const worstSpread = s.reduce((m, x) => Math.max(m, x.spread), 0);
  const worstStep = s.reduce((m, x) => Math.max(m, Math.abs(x.top)), 0);
  console.log(`[slow] ${label}: ${fs.length} frames, largest step ${worstStep.toFixed(2)}px, largest spread ${worstSpread.toFixed(2)}px`);
  expect(s.length, `${label}: frames compared`).toBeGreaterThan(30);
  for (const x of s) {
    expect(x.spread, `${label}: frame ${x.i}: rows on screen moved apart by ${x.spread.toFixed(2)}px ${JSON.stringify(x.deltas)}`).toBeLessThanOrEqual(0.6);
    expect(Math.abs(x.top), `${label}: frame ${x.i}: stepped ${x.top.toFixed(2)}px`).toBeLessThanOrEqual(maxStep);
    if (dir === 'older') expect(x.top, `${label}: frame ${x.i}: moved ${x.top}px against the scroll`).toBeGreaterThanOrEqual(-0.6);
    if (dir === 'newer') expect(x.top, `${label}: frame ${x.i}: moved ${x.top}px against the scroll`).toBeLessThanOrEqual(0.6);
  }
}

test('reading still while people post, edit, delete and media loads off screen: nothing on screen moves', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.following(false));
  await slowWheel(page, -100, 15);
  await atRest(page, 600);
  await startRecording(page);
  await startChaos(page);
  // An older page arriving too.
  await page.evaluate(() => void window.__vlogCtl.loadOlder());
  await page.waitForTimeout(3000);
  await stopChaos(page);
  await atRest(page, 400);
  expectRigid(await stopRecording(page), 'still', 0.6, 'reading still');
});

test('scrolling up slowly while people post and edit: the view moves only by the scroll', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.following(false));
  await slowWheel(page, -100, 6);
  await atRest(page, 600);
  await startRecording(page);
  await startChaos(page);
  await slowWheel(page, -2, 240);
  await stopChaos(page);
  await atRest(page, 300);
  expectRigid(await stopRecording(page), 'older', 4.6, 'slow up');
});

test('scrolling down slowly after a jump, through rows not yet measured, while people post: smooth', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.following(false));
  await page.getByRole('button', { name: 'Hold an older row' }).click();
  await atRest(page, 800);
  await startRecording(page);
  await startChaos(page);
  await slowWheel(page, 2, 240);
  await stopChaos(page);
  await atRest(page, 300);
  expectRigid(await stopRecording(page), 'newer', 4.6, 'slow down');
});

test('slow scroll, then a pause mid-history while people post: nothing moves when the log settles', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.following(false));
  await slowWheel(page, -100, 10);
  await atRest(page, 600);
  await startChaos(page, 120);
  await slowWheel(page, -1, 120);
  // The log settles and commits whatever it held while the scroll ran; people keep posting.
  await startRecording(page);
  await page.waitForTimeout(1500);
  await stopChaos(page);
  await atRest(page, 300);
  expectRigid(await stopRecording(page), 'still', 0.6, 'pause');
});

test('an edit on screen moves only the rows below it, by its growth', async ({ page }) => {
  await page.evaluate(() => window.__vlogCtl.following(false));
  await slowWheel(page, -100, 10);
  await atRest(page, 600);
  const mid = await page.evaluate((sel) => {
    const s = document.querySelector(sel)!.getBoundingClientRect();
    const rows = [...document.querySelectorAll<HTMLElement>(`${sel} [data-msg]`)].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.top > s.top + s.height / 3 && b.bottom < s.bottom - s.height / 3;
    });
    return Number(rows[0]!.dataset['msg']);
  }, SCROLLER);
  await startRecording(page);
  const before = await page.evaluate(([sel, n]) => document.querySelector(`${sel} [data-msg="${n}"]`)!.getBoundingClientRect().height, [SCROLLER, mid] as const);
  await page.evaluate((n) => window.__vlogCtl.edit(n, 80), mid);
  await atRest(page, 500);
  const after = await page.evaluate(([sel, n]) => document.querySelector(`${sel} [data-msg="${n}"]`)!.getBoundingClientRect().height, [SCROLLER, mid] as const);
  const fs = await stopRecording(page);
  const growth = after - before;
  expect(growth).toBeGreaterThan(10);
  // Over the whole recording: rows above the edit never moved; rows from it down moved once, by the growth.
  const first = fs[0]!.rows;
  const last = fs[fs.length - 1]!.rows;
  for (const k of Object.keys(first).map(Number)) {
    if (!(k in last)) continue;
    const moved = last[k]! - first[k]!;
    if (k < mid) expect(Math.abs(moved), `row ${k} above the edit moved ${moved}`).toBeLessThanOrEqual(0.6);
    else expect(Math.abs(moved - growth), `row ${k} below the edit moved ${moved}, growth ${growth}`).toBeLessThanOrEqual(0.6);
  }
  // And no frame in between showed anything else.
  for (const x of steps(fs)) for (const [k, d] of Object.entries(x.deltas)) if (Number(k) < mid) expect(Math.abs(d)).toBeLessThanOrEqual(0.6);
});

test('at the newest row, a new post moves the view up by exactly its height, in one frame', async ({ page }) => {
  // #2000 carries an image; #2001, measured here, is text only.
  await page.evaluate(() => window.__vlogCtl.append());
  await atRest(page, 800);
  await startRecording(page);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__vlogCtl.append());
  await atRest(page, 600);
  const fs = await stopRecording(page);
  const newH = await page.evaluate((sel) => document.querySelector(`${sel} [data-msg="2001"]`)!.getBoundingClientRect().height, SCROLLER);
  const s = steps(fs).filter((x) => Math.abs(x.median) > 0.5 || x.spread > 0.5);
  expect(s.map((x) => x.spread)).toEqual([0]);
  expect(Math.abs(-s[0]!.median - newH)).toBeLessThanOrEqual(1);
});

test('at the newest row, a post whose unsized image loads later moves twice: by the post, then by the image', async ({ page }) => {
  await startRecording(page);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__vlogCtl.append());
  await atRest(page, 800);
  const fs = await stopRecording(page);
  const s = steps(fs).filter((x) => Math.abs(x.median) > 0.5 || x.spread > 0.5);
  // The post appears whole (measured before it is painted); the image's own growth is the only other move.
  expect(s.length).toBe(2);
  expect(s[0]!.spread).toBe(0);
  const grew = s[1]!.deltas;
  const newest = Math.max(...Object.keys(grew).map(Number));
  expect(Math.abs(grew[newest]!), 'the new post keeps its bottom at the newest end').toBeLessThanOrEqual(0.6);
  for (const [k, d] of Object.entries(grew)) if (Number(k) < newest) expect(d).toBeCloseTo(-160, 0);
});

for (const [speed, px] of [['slowly', 3], ['quickly', 30]] as const) {
  test(`posts arriving while scrolled up are reached by scrolling down ${speed}, without a pause or a false bottom`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(() => window.__vlogCtl.following(false));
    await slowWheel(page, -100, 12);
    await atRest(page, 800);
    const box = (await page.locator(SCROLLER).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await startRecording(page);
    let reachedWhileScrolling = false;
    // Scroll down without stopping; three posts arrive on the way; keep pushing past the bottom.
    const events = Math.ceil(2600 / px);
    for (let i = 0; i < events; i++) {
      if (i === 5 || i === 10 || i === 15) await page.evaluate(() => window.__vlogCtl.append());
      await page.mouse.wheel(0, px);
      await page.waitForTimeout(16);
      if (!reachedWhileScrolling && i > 20 && i % 5 === 0)
        reachedWhileScrolling = await page.evaluate((sel) => {
          const s = document.querySelector(sel)!.getBoundingClientRect();
          const newest = document.querySelector(`${sel} [data-msg="2002"]`)?.getBoundingClientRect();
          return !!newest && window.__vlog.isScrolling() && s.bottom - newest.bottom > 8 && s.bottom - newest.bottom < 16;
        }, SCROLLER);
    }
    const fs = await stopRecording(page);
    expect(reachedWhileScrolling, 'the newest post reached the bottom while still scrolling').toBe(true);
    // Folding the held correction speeds the content up to 2x the scroll near the bottom, never more, never back.
    expectRigid(fs, 'newer', px * 2 * 1.5 + 1, `posts then down ${speed}`);
  });
}

for (const [speed, px] of [['slowly', 8], ['quickly', 30]] as const) {
  test(`after a jump into history, scrolling down ${speed} pages newer messages in up to the latest, posts included`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.evaluate(() => window.__vlogCtl.following(false));
    await page.evaluate(() => window.__vlogCtl.openAround(1820));
    await atRest(page, 800);
    const box = (await page.locator(SCROLLER).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await startRecording(page);
    let reached = false;
    for (let i = 0; i < Math.ceil(20_000 / px) && !reached; i++) {
      if (i === 30 || i === 60) await page.evaluate(() => window.__vlogCtl.append());
      await page.mouse.wheel(0, px);
      await page.waitForTimeout(16);
      if (i % 10 === 0)
        reached = await page.evaluate((sel) => {
          const s = document.querySelector(sel)!.getBoundingClientRect();
          const newest = document.querySelector(`${sel} [data-msg="2001"]`)?.getBoundingClientRect();
          return !!newest && s.bottom - newest.bottom > 8 && s.bottom - newest.bottom < 16;
        }, SCROLLER);
    }
    const fs = await stopRecording(page);
    expect(reached, 'scrolled all the way to the latest post').toBe(true);
    expectRigid(fs, 'newer', px * 2 * 1.5 + 1, `jump then down ${speed}`);
  });
}
