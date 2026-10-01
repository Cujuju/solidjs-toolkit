import { test, expect, type Page } from '@playwright/test';
import { SCROLLER, startRecording, steps, stopRecording, untiled, type Frame } from './frameRecorder';

/**
 * Smoothness, frame by frame. A recorder samples every on-screen row's bottom edge each animation frame (rows are bottom-anchored: one growing
 * extends upward) while the log is
 * scrolled continuously (touch flings through Chromium's gesture synthesizer; a trackpad-like wheel stream in WebKit)
 * as media loads and older pages arrive. A pop is a frame where what is on screen jumps: a step far larger than the
 * scroll's own, motion against the scroll, or any motion once the user has stopped (the log committing its correction).
 */

declare global {
  interface Window {
    __vlog: { isScrolling(): boolean; shift(): number; distanceFromBottom(): number };
    __vlogCtl: { olderDelayMs(ms: number): void; mediaDelayMs(ms: number): void };
  }
}

test.use({ video: 'on', viewport: { width: 700, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/#/virtual-log');
  await expect(page.locator(`${SCROLLER} [data-msg]`).first()).toBeVisible();
  await page.waitForTimeout(500);
  await startRecording(page);
});

const frames = stopRecording;

/** Fails on a jump: a step more than `maxStep`, content moving down while scrolling toward older rows, or a torn frame. */
function expectSmooth(fs: Frame[], dir: 'older' | 'newer', maxStep: number, label: string): void {
  expect(untiled(fs), `${label}: frames with a gap, overlap or missing row`).toEqual([]);
  const s = steps(fs);
  const shifted = fs.filter((f) => Math.abs(f.shift) > 0.5).length;
  const worst = s.reduce((m, x) => Math.max(m, Math.abs(x.top)), 0);
  console.log(`[smooth] ${label}: ${fs.length} frames, ${shifted} with a correction held in shift, largest step ${worst.toFixed(1)}px`);
  expect(s.length, `${label}: frames recorded`).toBeGreaterThan(30);
  const moving = s.filter((x) => Math.abs(x.median) > 0.5);
  expect(moving.length, `${label}: content moved`).toBeGreaterThan(5);
  for (const x of s) {
    expect(Math.abs(x.top), `${label}: frame ${x.i} top row stepped ${x.top}px`).toBeLessThanOrEqual(maxStep);
    // Scrolling toward older rows moves content down the screen (positive), never back up.
    const against = dir === 'older' ? -x.top : x.top;
    expect(against, `${label}: frame ${x.i} moved ${x.top}px against the scroll`).toBeLessThanOrEqual(1);
  }
}

/** After the input ends: nothing on screen may move while the log settles and commits. */
async function expectStillAfter(page: Page, ms: number, label: string): Promise<void> {
  await page.evaluate(() => (window.__frames = []));
  await page.waitForTimeout(ms);
  const fs = await frames(page);
  const s = steps(fs);
  const worst = s.reduce((m, x) => Math.max(m, Math.abs(x.median), Math.abs(x.top)), 0);
  expect(worst, `${label}: moved ${worst}px after the scroll ended`).toBeLessThanOrEqual(1);
}

/** Waits for any momentum to end: the log reports rest. */
async function untilAtRest(page: Page): Promise<void> {
  await page.waitForFunction(() => !window.__vlog.isScrolling(), undefined, { timeout: 10_000 });
}

test('touch flings up through loading pages and media are smooth (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch gestures are synthesized through Chromium DevTools');
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.locator(SCROLLER).boundingBox())!;
  for (let i = 0; i < 6; i++) {
    // Finger drags down (content follows: toward older rows), then is released into a fling.
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + 120),
      yDistance: 420,
      speed: 2400,
      gestureSourceType: 'touch',
      preventFling: false,
    });
  }
  await untilAtRest(page);
  const fs = await frames(page);
  // A 2400px/s drag moves ~40px a frame; a fling starts faster.
  expectSmooth(fs, 'older', 120, 'touch fling');
});

test('a trackpad-style scroll up through loading pages and media is smooth', async ({ page }) => {
  const box = (await page.locator(SCROLLER).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // 4s of 25px notches every 16ms: a steady, fast trackpad scroll.
  for (let i = 0; i < 250; i++) {
    await page.mouse.wheel(0, -25);
    await page.waitForTimeout(16);
  }
  await untilAtRest(page);
  const fs = await frames(page);
  expectSmooth(fs, 'older', 80, 'wheel stream');
});

test('scrolling back down toward the newest rows is smooth', async ({ page }) => {
  const box = (await page.locator(SCROLLER).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 120; i++) {
    await page.mouse.wheel(0, -40);
    await page.waitForTimeout(16);
  }
  await untilAtRest(page);
  await page.waitForTimeout(600);
  await page.evaluate(() => (window.__frames = []));
  // Unmeasured rows below the view, measured as they come in: the case TanStack compensated with scroll writes.
  await page.evaluate(() => window.__vlogCtl.mediaDelayMs(150));
  for (let i = 0; i < 150; i++) {
    await page.mouse.wheel(0, 25);
    await page.waitForTimeout(16);
  }
  await untilAtRest(page);
  expectSmooth(await frames(page), 'newer', 80, 'wheel down');
});

test('nothing moves after the user stops, while the log commits its correction', async ({ page }) => {
  const box = (await page.locator(SCROLLER).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, -40);
    await page.waitForTimeout(16);
  }
  // Past any wheel animation, before the log's settle (150ms quiet): media keeps loading below the view, then the
  // correction taken mid-scroll moves into the scroll offset. Neither may show.
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.__vlog.isScrolling())).toBe(true);
  await expectStillAfter(page, 1500, 'after stop');
});
