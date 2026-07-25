import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Auto-hide flyouts, in a real browser.
 *
 * This suite exists because of a bug found BY EYE, in a screenshot, that no test
 * in this repo could have caught: the flying-out panel's docked column stayed in
 * the layout and painted its title bar on top of the flyout floating over it, so
 * the panel's first row was hidden behind a header. jsdom has no layout, so
 * "is anything drawing on top of this" is not a question it can be asked.
 *
 * Every assertion here is therefore GEOMETRIC or COMPUTED — what overlaps what,
 * what actually occupies space, what a click at a point would hit. Those are the
 * only terms in which that class of defect is expressible.
 */

const AUTO_HIDE_DOCK = '[aria-label="Auto-hide dock"]';
const PANEL_TITLE = 'Solution Explorer';
const RAIL_LABEL = 'EXPL';

function dock(page: Page): Locator {
  return page.locator(AUTO_HIDE_DOCK);
}

/** The flyout surface. Portalled to <body>, so it is deliberately NOT looked up
 *  inside the dock — a selector scoped to the group would silently match nothing
 *  and every `toBeVisible` would fail for the wrong reason. */
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
    // THE regression test. Previously the docked column's `.acc-col-bar` sat over
    // the flyout at the same top edge and covered the first row, because the
    // panel never received `data-flyout` and so was never taken out of the
    // layout. `elementFromPoint` asks the question the way the user asked it:
    // what is actually drawn here?
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
    // `.acc-flyout` is `overflow: hidden`, so if the host does not scroll, any
    // content taller than the dock is unreachable with no affordance.
    //
    // EXPL rather than OUT: this rail is short enough that the fourth button
    // lives in the `⋯` overflow menu, so addressing it by rail label would be
    // asserting against the overflow strategy rather than against scrolling.
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
    // The claim the demo card makes in prose: once pinned, "the next panel you
    // open floats over the remainder instead of displacing it".
    //
    // NOT-overlapping would be the wrong assertion, and asserting it was my
    // error before this: in `fill` mode a single pinned column expands to the
    // whole dock, so there is no remainder to sit beside and the flyout is
    // SUPPOSED to float over it. Overlap is the feature. What must not happen is
    // the pinned column being moved or resized to make room — the reflow that
    // pinning is a promise against.
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
   * The grace period after the pointer leaves a hover-opened flyout is
   * FLYOUT_HOVER_LEAVE_GRACE_MS (260) and the open delay is
   * FLYOUT_HOVER_ENTER_DELAY_MS (350). Both are waited out with margin rather
   * than mirrored as constants here: a test that imports the timing it is
   * verifying passes when the constant is wrong, and the only thing this suite
   * can honestly assert is "longer than the product waits".
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
   * THE regression test for the bug the user reported by eye.
   *
   * The pointer-intent listeners lived on `.acc-flyout-host` — the element the
   * panel's subtree portals into — which is only PART of the flyout surface: its
   * title bar is a SIBLING, not a descendant. `pointerleave` does not bubble and
   * fires per element, so moving from the content up into the title bar left the
   * listening element and entered nothing, the grace timer ran to completion, and
   * the flyout dismissed under a pointer that had never left it.
   *
   * The user-visible consequence is the one asserted here: the pin — the single
   * control the whole auto-hide mode exists for, and which lives IN that title
   * bar — could not be reached by hover before the panel vanished.
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
    // The other half of the contract — the fix must not turn a peek into a
    // permanent overlay. Without this, "survives the title bar" could be passed
    // by simply never dismissing on hover at all.
    await enableHover(page);
    await railButton(page, RAIL_LABEL).hover();
    await expect(flyout(page)).toBeVisible();

    await page.locator('.nav h1').hover();
    await expect(flyout(page)).toHaveCount(0);
  });
});
