import { test, expect, type Page } from '@playwright/test';

/**
 * Resize from the KEYBOARD, in a real browser.
 *
 * The engine's arithmetic is unit-tested; what needs a browser is whether the
 * handle can be reached and operated at all. "Is this element focusable" and "did
 * the column actually get wider" are layout questions, and the defect being pinned
 * — a `role="separator"` with no `tabindex` and no key handler — is invisible to
 * every check that does not try to use it.
 */

const MULTI_DOCK = '[aria-label="Multi-open group"]';

/**
 * This dock is VERTICAL — panels stack downward, so the boundary slides on y and
 * the keys are Up/Down. Stated once here because every assertion below reads
 * `height`, and reading `width` instead would produce a suite that passes only if
 * the splitter does nothing.
 */
const GROW_KEY = 'ArrowDown';
const SHRINK_KEY = 'ArrowUp';

/** The one group on the page with two panels open at once, and therefore the only
 *  one with a boundary to drag: a splitter exists only BETWEEN open panels. */
function splitter(page: Page) {
  return page.locator(`${MULTI_DOCK} .acc-splitter`).first();
}

/** The panel the splitter resizes — the one it sits inside. */
function resizedPanel(page: Page) {
  return page.locator(`${MULTI_DOCK} .acc-panel`).filter({ has: page.locator('.acc-splitter') }).first();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#/accordion-dock');
  await expect(page.locator(MULTI_DOCK)).toBeVisible();
});

test('the splitter can be focused', async ({ page }) => {
  // Without `tabindex` this fails outright: `.focus()` on a non-focusable div
  // leaves activeElement on <body>, silently.
  await splitter(page).focus();
  const focused = await page.evaluate(() =>
    document.activeElement?.classList.contains('acc-splitter'),
  );
  expect(focused).toBe(true);
});

test('an arrow key moves the boundary', async ({ page }) => {
  const panel = resizedPanel(page);
  const before = (await panel.boundingBox())!.height;

  await splitter(page).focus();
  await page.keyboard.press(GROW_KEY);

  await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(before);
});

test('the opposite arrow moves it back', async ({ page }) => {
  // Both directions, so the binding cannot be satisfied by a handler that grows on
  // any key.
  const panel = resizedPanel(page);
  await splitter(page).focus();
  await page.keyboard.press(GROW_KEY);
  const grown = (await panel.boundingBox())!.height;

  await page.keyboard.press(SHRINK_KEY);
  await expect.poll(async () => (await panel.boundingBox())!.height).toBeLessThan(grown);
});

test('Shift takes a coarser step than a bare arrow', async ({ page }) => {
  const panel = resizedPanel(page);
  const start = (await panel.boundingBox())!.height;

  await splitter(page).focus();
  await page.keyboard.press(GROW_KEY);
  const fine = (await panel.boundingBox())!.height - start;

  await page.keyboard.press(`Shift+${GROW_KEY}`);
  const coarse = (await panel.boundingBox())!.height - start - fine;

  expect(coarse).toBeGreaterThan(fine);
});

test('the separator announces where it is', async ({ page }) => {
  // A window splitter without `aria-value*` tells a screen reader that something is
  // adjustable and nothing about its position.
  const handle = splitter(page);
  await expect(handle).toHaveAttribute('aria-valuenow', /\d+/);
  await expect(handle).toHaveAttribute('aria-valuemin', /\d+/);
  await expect(handle).toHaveAttribute('aria-valuemax', /\d+/);

  const before = Number(await handle.getAttribute('aria-valuenow'));
  await handle.focus();
  await page.keyboard.press(`Shift+${GROW_KEY}`);
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(before);
});

test('the panel follows the pointer DURING a drag, not only on release', async ({ page }) => {
  /*
   * The risk the preview/commit split introduces, and the only one worth a browser
   * test.
   *
   * Splitting the writer means intermediate sizes take a different path from the
   * settled one. Wire that path to the wrong place and the drag still ends
   * correctly — so every end-state assertion passes — while the panel stops moving
   * under the pointer and jumps at release. That is a wholly different control to
   * use, and it is invisible to any test that only looks after mouseup.
   *
   * (The "one commit per gesture" half is asserted in the unit tests, against a
   * host that records which writer was called. Counting localStorage writes here
   * would be vacuous: this group declares no storageKey, so the count is zero
   * whether the split works or not.)
   */
  const panel = resizedPanel(page);
  // Scrolled into view FIRST. `page.mouse` takes viewport coordinates, and this
  // dock sits thousands of pixels down the demo page — pressing at an unscrolled
  // `boundingBox()` lands on empty space, and the drag silently never starts. The
  // keyboard tests above never hit this because `.focus()` scrolls on its own.
  await splitter(page).scrollIntoViewIfNeeded();
  const before = (await panel.boundingBox())!.height;

  const box = (await splitter(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60);

  // Still held down.
  const during = (await panel.boundingBox())!.height;
  expect(during).toBeGreaterThan(before);

  await page.mouse.up();
  const after = (await panel.boundingBox())!.height;
  // And the release keeps what the drag showed, rather than snapping back to the
  // seed or re-applying the delta twice.
  expect(after).toBeCloseTo(during, 0);
});
