import { test, expect, type Page } from '@playwright/test';

/**
 * A tooltip must paint above an open native popover. `z-index` reports what we asked for, not
 * what the compositor did, so the test reads the PAINTED pixel and the hit-test.
 */

const BLUE = { r: 0, g: 0, b: 255 };   // popover body
const GREEN = { r: 0, g: 200, b: 0 };  // tooltip panel
/** Per-channel tolerance: the panel has its own border/shadow compositing. */
const CHANNEL_TOLERANCE = 24;

async function openMenuAndHover(page: Page): Promise<{ x: number; y: number }> {
  await page.goto('/#kv-tooltip');
  await page.getByTestId('tl-open').click();
  await expect(page.getByTestId('tl-popover')).toBeVisible();

  // Hover the trigger and wait for the panel to exist.
  await page.getByTestId('tl-trigger').hover();
  await expect(page.locator('.ckv-panel')).toBeVisible();

  // The overlap point: the centre of the tooltip body. Assert it really is over
  // the popover, so a passing test can never be a tooltip that simply moved
  // somewhere harmless.
  const tip = await page.getByTestId('tl-tip-body').boundingBox();
  const pop = await page.getByTestId('tl-popover').boundingBox();
  if (!tip || !pop) throw new Error('missing boxes');
  const x = Math.round(tip.x + tip.width / 2);
  const y = Math.round(tip.y + tip.height / 2);
  expect(
    x > pop.x && x < pop.x + pop.width && y > pop.y && y < pop.y + pop.height,
    'the tooltip must actually overlap the popover, or this test proves nothing',
  ).toBe(true);
  return { x, y };
}

/** The colour actually painted at a viewport point, read from a screenshot. */
async function pixelAt(page: Page, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  const shot = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  // PNG: 8-bit RGBA, one pixel. Decode via the browser rather than a PNG lib.
  const b64 = shot.toString('base64');
  return page.evaluate(
    (data) =>
      new Promise<{ r: number; g: number; b: number }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = 1;
          c.height = 1;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          resolve({ r: d[0]!, g: d[1]!, b: d[2]! });
        };
        img.src = 'data:image/png;base64,' + data;
      }),
    b64,
  );
}

test.describe('tooltip vs. an open native popover', () => {
  test('the tooltip is what is PAINTED at the overlap point', async ({ page }) => {
    const { x, y } = await openMenuAndHover(page);
    const px = await pixelAt(page, x, y);
    const near = (a: number, b: number) => Math.abs(a - b) <= CHANNEL_TOLERANCE;
    expect(
      near(px.r, GREEN.r) && near(px.g, GREEN.g) && near(px.b, GREEN.b),
      `expected the tooltip (green) at the overlap, got rgb(${px.r},${px.g},${px.b}) — ` +
        `blue means the popover is painting over the tooltip`,
    ).toBe(true);
    expect(near(px.b, BLUE.b) && px.g < 100).toBe(false);
  });

  test('a NON-interactive tooltip paints above but does not steal the pointer', async ({ page }) => {
    // `pointer-events: none` is the contract: visible over the menu without making it unclickable.
    // Top-layer membership must not change that — paint and hit-testing are separate questions.
    const { x, y } = await openMenuAndHover(page);
    const stack = await page.evaluate(
      ([px, py]) =>
        document
          .elementsFromPoint(px as number, py as number)
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`),
      [x, y],
    );
    const topmost = stack[0] ?? '';
    expect(
      topmost.includes('ckv-panel') || topmost.includes('ckv-extra'),
      `a non-interactive panel must not take the hit: ${JSON.stringify(stack.slice(0, 4))}`,
    ).toBe(false);
  });

  test('an INTERACTIVE tooltip is what the pointer hits at the overlap point', async ({ page }) => {
    await page.goto('/#kv-tooltip');
    await page.getByTestId('tl-open').click();
    await expect(page.getByTestId('tl-popover')).toBeVisible();
    await page.getByTestId('tl-trigger-i').hover();
    await expect(page.getByTestId('tl-tip-body-i')).toBeVisible();

    const tip = await page.getByTestId('tl-tip-body-i').boundingBox();
    const pop = await page.getByTestId('tl-popover').boundingBox();
    if (!tip || !pop) throw new Error('missing boxes');
    const x = Math.round(tip.x + tip.width / 2);
    const y = Math.round(tip.y + tip.height / 2);
    expect(x > pop.x && x < pop.x + pop.width && y > pop.y && y < pop.y + pop.height).toBe(true);

    const stack = await page.evaluate(
      ([px, py]) =>
        document
          .elementsFromPoint(px as number, py as number)
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`),
      [x, y],
    );
    expect(
      (stack[0] ?? '').includes('ckv-') || (stack[1] ?? '').includes('ckv-'),
      `interactive panel must take the hit inside the top layer: ${JSON.stringify(stack.slice(0, 4))}`,
    ).toBe(true);
  });

  test('the popover is still open while the tooltip shows (no light-dismiss)', async ({ page }) => {
    await openMenuAndHover(page);
    // A tooltip promoted to the top layer must NOT be `popover="auto"`: an auto
    // popover light-dismisses its peers, which would close the very menu the
    // user is reading.
    await expect(page.getByTestId('tl-popover')).toBeVisible();
  });
});

/**
 * PLATFORM DISMISSAL (0.7.0, `popover="hint"`). Not "which surface paints on top?" but "when
 * does the platform take the tooltip AWAY, and does our state resync?" — none of it expressible
 * in jsdom.
 */

/**
 * Well under the demo's 5s hide delay, so a pass can never be our own timer firing — only
 * `onPlatformDismiss` unmounts a panel this fast. Also under Playwright's 5s default.
 */
const PLATFORM_DISMISS_TIMEOUT_MS = 2000;

/**
 * How long to let a show that must NOT happen fail to happen. Shows are synchronous on
 * `mouseenter`, so 300ms only absorbs a slow CI frame.
 */
const NO_SHOW_SETTLE_MS = 300;

/** Open the demo's `auto` popover WITHOUT a click — see the demo's comment. */
async function openAutoPopover(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('pd-auto');
    if (!el) throw new Error('demo fixture #pd-auto is missing');
    (el as HTMLElement).showPopover();
  });
  await expect(page.getByTestId('pd-auto')).toBeVisible();
}

test.describe('platform dismissal of a hint tooltip', () => {
  test('T5: a second tooltip closes the first, and the first UNMOUNTS', async ({ page }) => {
    // `hint` is one-at-a-time: the platform closes A when B shows. OUR half is the resync — the
    // wrapper must hear `onPlatformDismiss` and UNMOUNT, so the assertion is DETACHED, not
    // merely invisible.
    await page.goto('/#kv-tooltip');
    await page.getByTestId('pd-trigger-a').hover();
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();

    await page.getByTestId('pd-trigger-b').hover();
    await expect(page.getByTestId('pd-tip-b')).toBeVisible();

    await expect(page.getByTestId('pd-tip-a')).toHaveCount(0, {
      timeout: PLATFORM_DISMISS_TIMEOUT_MS,
    });
  });

  test('T5-control: leaving the trigger for a NON-tooltip does not remove the panel', async ({ page }) => {
    // The control that stops T5/T7 passing for the wrong reason: the pointer leaves A for an inert
    // button, so the only pending hide is the 5s debounce.
    await page.goto('/#kv-tooltip');
    await page.getByTestId('pd-trigger-a').hover();
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();

    await page.getByTestId('pd-auto-open').hover();
    await page.waitForTimeout(PLATFORM_DISMISS_TIMEOUT_MS);
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();
  });

  test('T6: Escape closes the tooltip first, the menu second', async ({ page }) => {
    // The layering contract (D3): KvTooltip's capture-phase handler consumes Escape and
    // `preventDefault`s it; AnchoredPopover's bubble handler skips prevented events. Innermost
    // first.
    await openMenuAndHover(page);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tl-tip-body')).toHaveCount(0, {
      timeout: PLATFORM_DISMISS_TIMEOUT_MS,
    });
    await expect(page.getByTestId('tl-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tl-popover')).toBeHidden();
  });

  test('T7: an auto popover opened afterwards closes the tooltip', async ({ page }) => {
    // The tooltip yields to a real surface with no code of ours. Opened programmatically on
    // purpose: a click would also light-dismiss the hint, blurring the two causes.
    await page.goto('/#kv-tooltip');
    await page.getByTestId('pd-trigger-a').hover();
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();

    await openAutoPopover(page);

    await expect(page.getByTestId('pd-tip-a')).toHaveCount(0, {
      timeout: PLATFORM_DISMISS_TIMEOUT_MS,
    });
  });

  test('T8: a suppressWhileTopLayerOpen tooltip still shows while another TOOLTIP is up', async ({ page }) => {
    // End-to-end proof of the `:not([data-ckv-tooltip-panel])` exclusion. Before it, A's own
    // promoted panel matched the top-layer query, so A suppressed S.
    await page.goto('/#kv-tooltip');
    await page.getByTestId('pd-trigger-a').hover();
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();

    // Without this, T8 could pass because A never reached the top layer at all. Also pins the
    // migration's central line: the panel is an OPEN `hint`.
    const panelState = await page.evaluate(() => {
      const el = document.querySelector('[data-ckv-tooltip-panel]');
      if (!el) return null;
      return { type: el.getAttribute('popover'), open: el.matches(':popover-open') };
    });
    expect(panelState).toEqual({ type: 'hint', open: true });

    await page.getByTestId('pd-trigger-s').hover();
    await expect(page.getByTestId('pd-tip-s')).toBeVisible();
  });

  test('T8b: the same tooltip DOES defer to a real popover', async ({ page }) => {
    // The other half of T8: with a genuine `auto` popover open, the suppressed tooltip must refuse
    // to show at all.
    await page.goto('/#kv-tooltip');
    await openAutoPopover(page);

    await page.getByTestId('pd-trigger-s').hover();
    await page.waitForTimeout(NO_SHOW_SETTLE_MS);
    await expect(page.getByTestId('pd-tip-s')).toHaveCount(0);
  });
});
