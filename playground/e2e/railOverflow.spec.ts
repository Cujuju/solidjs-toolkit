import { test, expect, type Page } from '@playwright/test';

/**
 * Rail overflow, and a panel whose button is no longer rendered. A detached node returns zeros
 * from `getBoundingClientRect` and does nothing on `.focus()` — jsdom has no layout.
 */

const DOCK = '[aria-label="Auto-hide dock"]';

/**
 * Squeeze the dock until the rail overflows. A style tag, not a viewport resize: the dock
 * declares its own height, so the RAIL overflows rather than the page.
 */
async function forceRailOverflow(page: Page): Promise<void> {
  await page.addStyleTag({ content: `${DOCK} { height: 96px !important; }` });
  await expect(page.locator(`${DOCK} .acc-rail-overflow`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#/accordion-dock');
  await expect(page.locator(DOCK)).toBeVisible();
});

test('a panel collapsed into the ⋯ menu opens its flyout AT the trigger', async ({ page }) => {
  // `setHeaderEl` was never called with null, so the group kept the detached node and anchored
  // the flyout to it — a zero rect at the origin, clamped to the viewport corner.
  await forceRailOverflow(page);

  const trigger = page.locator(`${DOCK} .acc-rail-overflow`);
  await trigger.click();
  const rows = page.locator('.cujuju-context-menu-item');
  await expect(rows.first()).toBeVisible();
  await rows.first().click();

  const flyout = page.locator('.acc-flyout');
  await expect(flyout).toBeVisible();

  const flyoutBox = await flyout.boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect(flyoutBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();

  // Anchored to the trigger means it emerges from the rail's outer edge, beside the trigger's
  // row. Asserting the RELATIONSHIP, not coordinates, so a restyle survives.
  expect(flyoutBox!.x).toBeGreaterThanOrEqual(triggerBox!.x);
  expect(flyoutBox!.y + flyoutBox!.height).toBeGreaterThan(triggerBox!.y);

  // The specific failure signature, pinned so a regression cannot pass by being
  // merely "somewhere sensible": the viewport corner is where a zero rect lands.
  const VIEWPORT_CLAMP_MARGIN_PX = 8;
  const inCorner =
    flyoutBox!.x <= VIEWPORT_CLAMP_MARGIN_PX && flyoutBox!.y <= VIEWPORT_CLAMP_MARGIN_PX;
  expect(inCorner).toBe(false);
});

test('a button that overflows and comes BACK anchors to itself again', async ({ page }) => {
  // NOT a regression test for the stale reference — it passes against the old code too. It
  // constrains the FIX: clearing on unmount must not clear too eagerly.
  const buttons = page.locator(`${DOCK} .acc-rail-btn`);
  const beforeCount = await buttons.count();
  const style = await page.addStyleTag({ content: `${DOCK} { height: 96px !important; }` });
  await expect(buttons).toHaveCount(1);
  await style.evaluate((el) => el.remove());
  await expect(buttons).toHaveCount(beforeCount);

  // The SECOND button: it unmounted under the squeeze, so the round trip is real, while sitting
  // high enough that the flyout is not clamped upward.
  const button = buttons.nth(1);
  await button.click();

  // Both boxes read AFTER the click: clicking scrolls the dock into view, and `boundingBox()`
  // is viewport-relative, so measuring first compares two scroll positions.
  const buttonBox = await button.boundingBox();
  const flyoutBox = await page.locator('.acc-flyout').boundingBox();
  expect(flyoutBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  // Emerges from its own button's row, which is the contract for a docked rail.
  expect(Math.abs(flyoutBox!.y - buttonBox!.y)).toBeLessThan(buttonBox!.height + 4);
});

test('arrowing onto an overflowed panel focuses the ⋯ trigger, not nothing', async ({ page }) => {
  // `moveFocus` read the raw element map, so arrowing onto a collapsed panel called `.focus()`
  // on a detached node. Asserting the trigger SPECIFICALLY: the old behaviour left focus where
  // it started.
  await forceRailOverflow(page);

  const visibleButtons = page.locator(`${DOCK} .acc-rail-btn`);
  await expect(visibleButtons).toHaveCount(1);
  await visibleButtons.first().focus();

  // The next panel in order is the first one that did not fit.
  await page.keyboard.press('ArrowDown');

  const focused = await page.evaluate(() => ({
    isTrigger: document.activeElement?.classList.contains('acc-rail-overflow') ?? false,
    cls: document.activeElement?.className ?? '',
  }));
  expect(focused.isTrigger, `focus landed on "${focused.cls}"`).toBe(true);
});
