import { test, expect, type Page } from '@playwright/test';

/**
 * Rail overflow, and what happens to a panel whose button is no longer rendered.
 *
 * This suite exists because of a class of defect that only a real browser can
 * see: an element reference that is still held after the element left the
 * document. A detached node answers `getBoundingClientRect()` with zeros and
 * `.focus()` with nothing, and neither is an error — so the symptoms are a
 * popover in the wrong place and a keystroke that does nothing, with a clean
 * console. jsdom cannot express either, because it has no layout.
 */

const DOCK = '[aria-label="Auto-hide dock"]';

/**
 * Squeeze the dock until the rail cannot fit its buttons.
 *
 * A style tag rather than a viewport resize: the dock declares its own height, so
 * shrinking the window does not shrink it, and the point is to make the RAIL
 * overflow rather than the page.
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
  // THE regression test. The rail button for an overflowed panel unmounts, and
  // `setHeaderEl` was only ever called with an element — never with null — so the
  // group kept the detached node and anchored the flyout to it. A detached node
  // measures as a zero-size rect at the origin, so the flyout was clamped to the
  // viewport's top-left corner: nowhere near the dock that produced it.
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

  // Anchored to the trigger means it emerges from the rail's outer edge, beside
  // the trigger's own row — not from the corner of the window. Asserting the
  // RELATIONSHIP rather than coordinates, so the test survives a restyle.
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
  // NOT a regression test for the stale-reference bug — stated plainly because a
  // test that looks like one and is not is worse than no test. It passes against
  // the OLD code too: a remounting button re-registered itself and overwrote the
  // stale entry, so the return trip was never the broken direction.
  //
  // It is here to constrain the FIX rather than to demonstrate the defect. Clearing
  // on unmount invites an over-correction that clears too eagerly (on any rail
  // re-render, say), and this is what would catch that: squeeze, release, and the
  // panel must anchor to its own restored button again.
  // Counted, not asserted as "no overflow at all": this dock's rotated rail
  // labels are tall enough that it overflows by one button at its NATURAL height
  // too. What matters is that buttons leave and come back, not that the trigger
  // disappears.
  const buttons = page.locator(`${DOCK} .acc-rail-btn`);
  const beforeCount = await buttons.count();
  const style = await page.addStyleTag({ content: `${DOCK} { height: 96px !important; }` });
  await expect(buttons).toHaveCount(1);
  await style.evaluate((el) => el.remove());
  await expect(buttons).toHaveCount(beforeCount);

  // The SECOND button: it is one of the ones that unmounted under the squeeze (so
  // the round trip is real), while sitting high enough in the rail that the
  // flyout is not clamped upward by the viewport — which the last button is.
  const button = buttons.nth(1);
  await button.click();

  // Both boxes read AFTER the click. Clicking scrolls the dock into view, and
  // `boundingBox()` is viewport-relative — measuring the button first compares two
  // different scroll positions and fails for a reason that has nothing to do with
  // anchoring.
  const buttonBox = await button.boundingBox();
  const flyoutBox = await page.locator('.acc-flyout').boundingBox();
  expect(flyoutBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  // Emerges from its own button's row, which is the contract for a docked rail.
  expect(Math.abs(flyoutBox!.y - buttonBox!.y)).toBeLessThan(buttonBox!.height + 4);
});

test('arrowing onto an overflowed panel focuses the ⋯ trigger, not nothing', async ({ page }) => {
  // `moveFocus` used to read the raw element map, so arrowing onto a panel whose
  // button had collapsed called `.focus()` on a detached node — which does nothing
  // at all, leaving focus where it was and the keystroke apparently ignored.
  //
  // Asserting the trigger SPECIFICALLY, not "some rail control": the old behaviour
  // left focus on the button it started from, which would satisfy any looser
  // assertion and make this test pass against the defect it names.
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
