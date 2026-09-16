import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Auto-hide flyouts in a real browser. Every assertion is geometric or computed — what overlaps
 * what, what a click would hit — because jsdom has no layout.
 */

const AUTO_HIDE_DOCK = '[aria-label="Auto-hide dock"]';
const PANEL_TITLE = 'Solution Explorer';
const RAIL_LABEL = 'EXPL';

function dock(page: Page): Locator {
  return page.locator(AUTO_HIDE_DOCK);
}

/** The flyout surface. Portalled to <body>, so deliberately NOT looked up inside the dock — a
 *  group-scoped selector would match nothing and fail for the wrong reason. */
function flyout(page: Page): Locator {
  return page.locator('.acc-flyout');
}

function railButton(page: Page, label: string): Locator {
  return dock(page).getByRole('tab', { name: new RegExp(label) });
}

/** The docked shell of a panel, by its title. Present in the DOM whether or not
 *  it is flying out — which is the whole point of the `data-flyout` contract. */
function panelShell(page: Page, title: string): Locator {
  return dock(page)
    .locator('.acc-panel')
    .filter({ has: page.locator('.acc-col-bar .acc-title', { hasText: title }) });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto('/#/accordion-dock');
  await expect(dock(page)).toBeVisible();
});

test.describe('auto-hide — the flyout is an overlay', () => {
  test('opening an unpinned panel floats it instead of adding a column', async ({ page }) => {
    await railButton(page, RAIL_LABEL).click();
    await expect(flyout(page)).toBeVisible();

    // The docked shell stays MOUNTED — it owns the refs the group measures and
    // the identity the reorder list tracks — but must take no space.
    const shell = panelShell(page, PANEL_TITLE);
    await expect(shell).toHaveAttribute('data-flyout', 'true');
    await expect(shell).toBeHidden();
  });

  test('NOTHING paints on top of the flyout’s first row', async ({ page }) => {
    // THE regression test. The docked column's bar sat over the flyout and covered the first row,
    // because the panel never got `data-flyout` and stayed in the layout.
    await railButton(page, RAIL_LABEL).click();
    const firstRow = flyout(page).getByText('file 1', { exact: true });
    await expect(firstRow).toBeVisible();

    const box = await firstRow.boundingBox();
    expect(box).not.toBeNull();

    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        insideFlyout: el?.closest('.acc-flyout') !== null && el?.closest('.acc-flyout') !== undefined,
        coveredByHeader: el?.closest('.acc-col-bar') !== null && el?.closest('.acc-col-bar') !== undefined,
        text: el?.textContent?.trim() ?? '',
      };
    }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });

    expect(hit.coveredByHeader).toBe(false);
    expect(hit.insideFlyout).toBe(true);
    expect(hit.text).toBe('file 1');
  });

  test('every row is reachable — the flyout is not clipped at the top', async ({ page }) => {
    // The visible symptom was "the list starts at file 2". Counting is the
    // cheapest way to state that no row was eaten.
    await railButton(page, RAIL_LABEL).click();
    await expect(flyout(page).locator('.readout > div')).toHaveCount(10);
    await expect(flyout(page).getByText('file 1', { exact: true })).toBeVisible();
  });

  test('the flyout carries the content padding a docked column has', async ({ page }) => {
    // The panel's `.acc-content` box stays behind in the docked shell, so only
    // the children portal out. Without the flyout host sharing the content-box
    // rule, text sat flush against the border.
    await railButton(page, RAIL_LABEL).click();
    const padding = await flyout(page)
      .locator('.acc-flyout-host')
      .evaluate((el) => getComputedStyle(el).padding);

    expect(padding).not.toBe('0px');
  });

  test('the flyout can scroll its own overflow rather than clipping it', async ({ page }) => {
    // `.acc-flyout` is `overflow: hidden`, so content taller than the dock is unreachable unless
    // the host scrolls. EXPL, not OUT: the fourth button lives in the overflow menu.
    await railButton(page, RAIL_LABEL).click();
    const overflow = await flyout(page)
      .locator('.acc-flyout-host')
      .evaluate((el) => getComputedStyle(el).overflowY);

    expect(['auto', 'scroll']).toContain(overflow);
  });
});

test.describe('auto-hide — pinning changes what the panel IS', () => {
  test('pinning promotes the flyout to a column that takes real space', async ({ page }) => {
    await railButton(page, RAIL_LABEL).click();
    await expect(flyout(page)).toBeVisible();

    await flyout(page).locator('.acc-pin').click();

    // No longer an overlay: the surface is gone and the docked shell now has a box.
    await expect(flyout(page)).toHaveCount(0);
    const shell = panelShell(page, PANEL_TITLE);
    await expect(shell).toHaveAttribute('data-flyout', 'false');
    await expect(shell).toBeVisible();

    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  });

  test('a pinned column is not overlapped by a second panel’s flyout', async ({ page }) => {
    // The demo's prose claim: once pinned, the next panel floats over the remainder. Overlap is
    // the FEATURE here — what must not happen is the pinned column being moved or resized.
    await railButton(page, RAIL_LABEL).click();
    await flyout(page).locator('.acc-pin').click();
    const before = await panelShell(page, PANEL_TITLE).boundingBox();
    expect(before).not.toBeNull();

    await railButton(page, 'PROP').click();
    await expect(flyout(page)).toBeVisible();
    const after = await panelShell(page, PANEL_TITLE).boundingBox();
    expect(after).not.toBeNull();

    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.width).toBeCloseTo(before!.width, 0);
  });
});

test.describe('auto-hide — dismissal', () => {
  test('clicking outside sends a transient flyout away', async ({ page }) => {
    await railButton(page, RAIL_LABEL).click();
    await expect(flyout(page)).toBeVisible();

    // Somewhere unambiguously outside both the flyout and the rail.
    await page.locator('.nav h1').click();
    await expect(flyout(page)).toHaveCount(0);
  });

  test('a pinned panel is NOT dismissed by clicking away', async ({ page }) => {
    // The pin's entire meaning in this mode: it stops being transient.
    await railButton(page, RAIL_LABEL).click();
    await flyout(page).locator('.acc-pin').click();

    await page.locator('.nav h1').click();
    await expect(panelShell(page, PANEL_TITLE)).toBeVisible();
  });
});

test.describe('auto-hide — hover-to-open', () => {
  /**
   * The hover grace (260ms) and open delay (350ms) are waited out with margin rather than
   * mirrored here: a test importing the timing it verifies passes when that constant is wrong.
   */
  const PAST_GRACE_MS = 600;

  async function enableHover(page: Page): Promise<void> {
    await page.getByRole('button', { name: /hoverToOpen: false/ }).click();
    await expect(page.getByRole('button', { name: /hoverToOpen: true/ })).toBeVisible();
  }

  test('hovering a rail button opens its flyout', async ({ page }) => {
    await enableHover(page);
    await railButton(page, RAIL_LABEL).hover();
    await expect(flyout(page)).toBeVisible();
  });

  /**
   * THE regression test. Pointer-intent listeners lived on `.acc-flyout-host`, but the title bar
   * is a SIBLING — moving into it left the listener, the grace expired, and the pin was
   * unreachable.
   */
  test('the flyout survives the pointer moving onto its own title bar', async ({ page }) => {
    await enableHover(page);
    await railButton(page, RAIL_LABEL).hover();
    await expect(flyout(page)).toBeVisible();

    // Into the body first, the way a user reaching for the pin actually travels.
    await flyout(page).getByText('file 1', { exact: true }).hover();
    await flyout(page).locator('.acc-col-bar .acc-title').hover();
    await page.waitForTimeout(PAST_GRACE_MS);

    await expect(flyout(page)).toBeVisible();
  });

  test('the pin in a hover-opened flyout can actually be clicked', async ({ page }) => {
    // The end-to-end version of the same defect: hover in, cross the title bar,
    // press the pin, and the panel should DOCK rather than have evaporated.
    await enableHover(page);
    await railButton(page, RAIL_LABEL).hover();
    await expect(flyout(page)).toBeVisible();

    await flyout(page).locator('.acc-pin').hover();
    await page.waitForTimeout(PAST_GRACE_MS);
    await flyout(page).locator('.acc-pin').click();

    // Pinned means promoted to a real column: the docked shell takes space again.
    await expect(panelShell(page, PANEL_TITLE)).toBeVisible();
    await expect(flyout(page)).toHaveCount(0);
  });

  test('leaving the flyout entirely still dismisses it', async ({ page }) => {
    // The other half of the contract: the fix must not turn a peek into a permanent overlay.
    await enableHover(page);
    await railButton(page, RAIL_LABEL).hover();
    await expect(flyout(page)).toBeVisible();

    await page.locator('.nav h1').hover();
    await expect(flyout(page)).toHaveCount(0);
  });
});
