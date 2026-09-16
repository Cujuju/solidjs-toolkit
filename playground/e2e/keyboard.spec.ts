import { test, expect, type Page } from '@playwright/test';

/**
 * The keyboard routes to things that are otherwise pointer-only. Whether focus can REACH
 * something is a question about tab order and listeners, so it needs a real browser.
 */

const AUTO_HIDE_DOCK = '[aria-label="Auto-hide dock"]';
const RAIL_LABEL = 'EXPL';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#/accordion-dock');
  await expect(page.locator(AUTO_HIDE_DOCK)).toBeVisible();
});

test.describe('a flyout can be reached and left by keyboard', () => {
  test('opening one moves focus into it', async ({ page }) => {
    /*
         * THE regression test. Focus stayed on the rail button; the popover is Portal'd away, so the
         * first Tab hit the next rail button, which `onFocusIn` reads as leaving.
         */
    await page.locator(AUTO_HIDE_DOCK).getByRole('tab', { name: new RegExp(RAIL_LABEL) }).click();
    await expect(page.locator('.acc-flyout')).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.closest('.acc-flyout') !== null),
      )
      .toBe(true);
  });

  test('Tab from there reaches the flyout’s own controls', async ({ page }) => {
    // The consequence that matters: the pin — the one control the whole auto-hide
    // mode exists for — is now reachable without a mouse.
    await page.locator(AUTO_HIDE_DOCK).getByRole('tab', { name: new RegExp(RAIL_LABEL) }).click();
    await expect(page.locator('.acc-flyout')).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.closest('.acc-flyout') !== null),
      )
      .toBe(true);

    await page.keyboard.press('Tab');
    const onPin = await page.evaluate(
      () => document.activeElement?.classList.contains('acc-pin') ?? false,
    );
    expect(onPin).toBe(true);
  });

  test('Escape closes it and puts focus back on the rail button', async ({ page }) => {
    // The way out has to land somewhere useful: focus dropped to <body> would make
    // the next Tab restart from the top of the document.
    const railButton = page
      .locator(AUTO_HIDE_DOCK)
      .getByRole('tab', { name: new RegExp(RAIL_LABEL) });
    await railButton.click();
    await expect(page.locator('.acc-flyout')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.acc-flyout')).toHaveCount(0);

    const backOnRail = await page.evaluate(
      () => document.activeElement?.classList.contains('acc-rail-btn') ?? false,
    );
    expect(backOnRail).toBe(true);
  });

  test('a HOVER-opened flyout does not steal focus', async ({ page }) => {
    // The other half: a pointer user mid-traverse has committed to nothing, so moving the caret
    // out from under them would be hostile. Deliberate opens only.
    await page.getByRole('button', { name: /hoverToOpen: false/ }).click();
    await page.locator(AUTO_HIDE_DOCK).getByRole('tab', { name: new RegExp(RAIL_LABEL) }).hover();
    await expect(page.locator('.acc-flyout')).toBeVisible();

    const stolen = await page.evaluate(
      () => document.activeElement?.closest('.acc-flyout') !== null,
    );
    expect(stolen).toBe(false);
  });
});

test.describe('the panel menu answers to the keyboard directly', () => {
  /*
   * A CORRECTION: the menu was never pointer-only — browsers synthesise `contextmenu` for
   * Shift+F10 and the ContextMenu key. The binding is kept for platforms lacking it; these tests
   * dispatch the keydown directly.
   */
  async function pressKeyOnFocused(page: Page, key: string, shift: boolean): Promise<void> {
    await page.evaluate(
      ({ key: k, shift: sh }) => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key: k, shiftKey: sh, bubbles: true, cancelable: true }),
        );
      },
      { key, shift },
    );
  }

  test('Shift+F10 opens it on the focused rail button', async ({ page }) => {
    await page.locator(AUTO_HIDE_DOCK).locator('.acc-rail-btn').first().focus();
    await pressKeyOnFocused(page, 'F10', true);
    await expect(page.locator('.cujuju-context-menu-item').first()).toBeVisible();
  });

  test('the ContextMenu key opens it too', async ({ page }) => {
    // Both bindings, because a keyboard without the dedicated key is common and a
    // test for only one would let the other rot.
    await page.locator(AUTO_HIDE_DOCK).locator('.acc-rail-btn').first().focus();
    await pressKeyOnFocused(page, 'ContextMenu', false);
    await expect(page.locator('.cujuju-context-menu-item').first()).toBeVisible();
  });

  test('an unrelated key does NOT open it', async ({ page }) => {
    // Guards the obvious over-broad handler.
    await page.locator(AUTO_HIDE_DOCK).locator('.acc-rail-btn').first().focus();
    await pressKeyOnFocused(page, 'F10', false);
    await expect(page.locator('.cujuju-context-menu-item')).toHaveCount(0);
  });

  test('it opens anchored to the button, not at the pointer', async ({ page }) => {
    // The behaviour the explicit binding actually buys: a deterministic anchor
    // instead of whatever coordinates a synthesised event happens to carry.
    const button = page.locator(AUTO_HIDE_DOCK).locator('.acc-rail-btn').first();
    await button.focus();
    const box = (await button.boundingBox())!;

    await pressKeyOnFocused(page, 'F10', true);
    const menu = page.locator('.cujuju-context-menu-item').first();
    await expect(menu).toBeVisible();

    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.y).toBeGreaterThanOrEqual(box.y);
    expect(Math.abs(menuBox.x - box.x)).toBeLessThan(box.width + 40);
  });

  test('the vertical header answers to it as well', async ({ page }) => {
    // Two activators wear the same key handler; a binding wired to only one would
    // leave the vertical dock without a keyboard route to the menu.
    await page.locator('[aria-label="Fill-mode dock"] .acc-header').first().focus();
    await pressKeyOnFocused(page, 'F10', true);
    await expect(page.locator('.cujuju-context-menu-item').first()).toBeVisible();
  });
});
