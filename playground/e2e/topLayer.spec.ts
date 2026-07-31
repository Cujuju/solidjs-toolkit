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
