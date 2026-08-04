import { test, expect, type Page } from '@playwright/test';

/**
 * A tooltip must paint above an open native popover.
 *
 * `AnchoredPopover` shows itself with `showPopover()`, which puts it in the
 * browser's TOP LAYER — a plane above the entire normal stacking context. A
 * `position: fixed` panel in a Portal cannot reach it at any z-index, so a
 * tooltip triggered from inside an open popover renders underneath the surface
 * it describes. A native `title` never did that, which makes this a REGRESSION
 * for every consumer that replaced `title` with this component.
 *
 * WHY PIXELS AND HIT-TESTING, NOT z-index ASSERTIONS. Reading computed
 * `z-index` would tell us what we asked for, not what the compositor did — and
 * the whole failure is that the value is honoured within a plane that itself
 * sits below another one. So the test asks the two questions a user would:
 *
 *   1. WHAT IS PAINTED at the overlap point? (screenshot pixel)
 *   2. WHAT WOULD THE MOUSE HIT there? (elementsFromPoint — the top layer
 *      participates in hit-testing, so this is a second, independent read)
 *
 * The demo paints the popover pure blue and the tooltip body pure green, so the
 * pixel answer is unambiguous rather than a judgement about anti-aliasing.
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
    // `pointer-events: none` is the contract for a plain tooltip: it must be
    // visible over the menu without making the menu unclickable through it.
    // Being in the top layer must not change that — paint and hit-testing are
    // separate questions, and only the first one was ever the bug.
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
 * PLATFORM DISMISSAL (0.7.0, `popover="hint"`).
 *
 * The suite above asks "which surface paints on top?". This one asks the
 * opposite question — "when does the platform take the tooltip AWAY, and does
 * our state resync when it does?" — which is the entire reason the panel moved
 * from `manual` to `hint`. None of it is expressible in jsdom: every assertion
 * here needs a real top layer.
 */

/**
 * Assertion budget for "the panel is gone". Deliberately well UNDER the demo's
 * `PLATFORM_CASE_HIDE_DELAY_MS` (5s) so a pass can never be our own hide timer
 * finally firing — the only thing that can unmount a panel this fast is
 * `onPlatformDismiss`. Also under Playwright's 5s expect default, which would
 * otherwise straddle the debounce.
 */
const PLATFORM_DISMISS_TIMEOUT_MS = 2000;

/**
 * How long to let a show that must NOT happen fail to happen. A show is
 * synchronous on `mouseenter` (no `showDelayMs` on these triggers), so anything
 * past one frame is generous; 300ms absorbs a slow CI frame without making the
 * negative test a wait-and-hope.
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
    // `hint` is one-at-a-time: the platform closes tooltip A when tooltip B is
    // shown. The half that is OURS is what happens next — the wrapper must hear
    // about it (`onPlatformDismiss` → `hideNow`) and unmount, or it would sit
    // there believing it is still showing a panel the browser has taken away,
    // and the next hover would be a no-op because `visible()` never went false.
    //
    // So the assertion is DETACHED, not merely invisible: a demoted-but-mounted
    // node is exactly the failure this test exists to catch.
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
    // The control that stops T5/T7 from passing for the wrong reason. Both
    // assert "the panel disappeared within 2s of the pointer leaving trigger A";
    // that would be true of ANY tooltip if the hide were the usual immediate
    // one. Here the pointer leaves A for an inert button, so the ONLY pending
    // cause of a hide is the 5s debounce — and the panel must still be there.
    await page.goto('/#kv-tooltip');
    await page.getByTestId('pd-trigger-a').hover();
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();

    await page.getByTestId('pd-auto-open').hover();
    await page.waitForTimeout(PLATFORM_DISMISS_TIMEOUT_MS);
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();
  });

  test('T6: Escape closes the tooltip first, the menu second', async ({ page }) => {
    // The layering contract (D3). Both KvTooltip and AnchoredPopover want
    // Escape, and a single keypress closing BOTH would mean dismissing a
    // tooltip costs the user the surface they were reading. KvTooltip's
    // capture-phase handler runs first and `preventDefault`s the key it
    // consumed; AnchoredPopover's bubble-phase handler skips a defaultPrevented
    // event. Innermost first.
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
    // The tooltip yields to a real surface with no code of ours involved. The
    // popover is opened programmatically on purpose: a CLICK would also
    // light-dismiss the hint, and then a pass would not distinguish "auto
    // popovers close hints" from "clicks close hints".
    await page.goto('/#kv-tooltip');
    await page.getByTestId('pd-trigger-a').hover();
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();

    await openAutoPopover(page);

    await expect(page.getByTestId('pd-tip-a')).toHaveCount(0, {
      timeout: PLATFORM_DISMISS_TIMEOUT_MS,
    });
  });

  test('T8: a suppressWhileTopLayerOpen tooltip still shows while another TOOLTIP is up', async ({ page }) => {
    // The end-to-end proof of the `:not([data-ckv-tooltip-panel])` exclusion.
    // Before it, tooltip A's own promoted panel matched the "is a top-layer
    // surface open?" query, so A suppressed S — the prop degenerated into "only
    // one tooltip on the page, ever".
    await page.goto('/#kv-tooltip');
    await page.getByTestId('pd-trigger-a').hover();
    await expect(page.getByTestId('pd-tip-a')).toBeVisible();

    // Without this, T8 could pass because tooltip A never made it into the top
    // layer at all — in which case the exclusion was never exercised. It also
    // pins the migration's central line: the panel is an OPEN `hint`.
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
    // The other half of T8, and the reason T8 is not satisfied by a prop that
    // simply stopped working: with a genuine `auto` popover open, the suppressed
    // tooltip must refuse to show at all.
    await page.goto('/#kv-tooltip');
    await openAutoPopover(page);

    await page.getByTestId('pd-trigger-s').hover();
    await page.waitForTimeout(NO_SHOW_SETTLE_MS);
    await expect(page.getByTestId('pd-tip-s')).toHaveCount(0);
  });
});
