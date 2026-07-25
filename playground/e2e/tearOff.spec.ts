import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Tear-off, in a real browser.
 *
 * This suite exists because the jsdom tests CANNOT answer the questions that
 * matter most about this feature. There, `window.open` is a stub returning a
 * hand-built object, the popup "document" is one I constructed, and there is no
 * layout engine — so every assertion about cross-document rendering was really
 * an assertion about my own fake. Here the browser answers:
 *
 *   - does a real popup actually open, and is it same-origin scriptable;
 *   - are the panel's nodes MOVED into it rather than re-created (the entire
 *     premise of the single-Portal design, and the thing that decides whether a
 *     scroll position or an in-flight edit survives);
 *   - does the cloned CSS actually paint there;
 *   - does the popup body keep the frame that `mirrorAttributes` used to wipe.
 */

const RAIL_DOCK = '[aria-label="Horizontal rail dock"]';
const PANEL_TITLE = 'Solution Explorer';

/** Marker written onto a live node inside the popup, then looked for back in the
 *  dock. An attribute set from the test is invisible to the framework, so it can
 *  only survive if the ELEMENT survived — which is exactly the claim under test. */
const MOVE_TOKEN_ATTR = 'data-e2e-move-token';

function railDock(page: Page): Locator {
  return page.locator(RAIL_DOCK);
}

/** The column whose title bar carries `title`. Panels expose no id attribute, so
 *  the title bar is the stable handle — and it is also what a user reads. */
function column(page: Page, title: string): Locator {
  return railDock(page)
    .locator('.vsa-panel')
    .filter({ has: page.locator('.vsa-col-bar .vsa-title', { hasText: title }) });
}

async function openPopup(page: Page, title: string): Promise<Page> {
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    column(page, title).locator('.vsa-tearoff').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  return popup;
}

test.beforeEach(async ({ page }) => {
  // The rail card persists its layout under `playground:vsa:rail`, and tear-off
  // persists window geometry — without this, state leaks between tests and the
  // first failure cascades into the rest.
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto('/#/vs-accordion');
  await expect(railDock(page)).toBeVisible();
});

test.describe('tear-off — opening', () => {
  test('pops the panel into a real window titled after it', async ({ page }) => {
    const popup = await openPopup(page, PANEL_TITLE);

    // The OS window chrome is a torn-off panel's only label.
    await expect(popup).toHaveTitle(PANEL_TITLE);
    expect(popup.isClosed()).toBe(false);
  });

  test('the panel CONTENT renders in the popup, not in the dock', async ({ page }) => {
    const popup = await openPopup(page, PANEL_TITLE);

    await expect(popup.getByText('file 1', { exact: true })).toBeVisible();
    // The docked shell stays mounted — it owns the refs the group measures — but
    // it must not still be painting the content.
    await expect(column(page, PANEL_TITLE).getByText('file 1', { exact: true })).toBeHidden();
  });

  test('the popup body keeps the panel FRAME', async ({ page }) => {
    // Regression, and the reason this suite exists. `syncStyles` mirrors the
    // opener's root attributes onto the popup, and its reconciliation loop
    // removed any attribute the opener lacked — including `style`, since a normal
    // <body> has no inline style. That wiped the frame set moments earlier, so
    // the panel did not fill its window and the popup document scrolled.
    //
    // Asserted on COMPUTED style in a real engine, which is the only place the
    // question is actually settled.
    const popup = await openPopup(page, PANEL_TITLE);
    const frame = await popup.evaluate(() => {
      const s = getComputedStyle(document.body);
      return {
        display: s.display,
        flexDirection: s.flexDirection,
        margin: s.margin,
        overflow: s.overflow,
      };
    });

    expect(frame.display).toBe('flex');
    expect(frame.flexDirection).toBe('column');
    expect(frame.margin).toBe('0px');
    expect(frame.overflow).toBe('hidden');
  });

  test('the popup does not scroll its own document', async ({ page }) => {
    // The user-visible consequence of the frame above: the panel owns its
    // scrolling exactly as it does in a column.
    const popup = await openPopup(page, PANEL_TITLE);
    const scrolls = await popup.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    );
    expect(scrolls).toBe(false);
  });

  test('the opener’s stylesheets actually paint there', async ({ page }) => {
    // jsdom clones style nodes without ever applying them, so the whole
    // `syncStyles` path was previously unfalsifiable. A padding that resolves to
    // a real value can only come from the cloned `--vsa-content-pad` token.
    const popup = await openPopup(page, PANEL_TITLE);
    const styled = await popup.evaluate(() => {
      const host = document.querySelector('.readout');
      if (host === null) return null;
      return getComputedStyle(host).padding;
    });

    expect(styled).not.toBeNull();
    expect(styled).not.toBe('0px');
  });
});

test.describe('tear-off — the nodes are MOVED, not re-created', () => {
  test('a node tagged in the popup comes home to the dock', async ({ page }) => {
    // THE test. The control's stay-mounted rule, its scroll-position promise and
    // its in-flight-edit promise all reduce to this one physical claim: docking
    // re-parents the SAME elements. An attribute written from the test is
    // invisible to the framework, so it cannot be re-created — only carried.
    const popup = await openPopup(page, PANEL_TITLE);
    await popup
      .getByText('file 1', { exact: true })
      .evaluate((el, attr) => el.setAttribute(attr, 'carried'), MOVE_TOKEN_ATTR);

    await column(page, PANEL_TITLE).locator('.vsa-tearoff').click();

    const carried = column(page, PANEL_TITLE).locator(`[${MOVE_TOKEN_ATTR}="carried"]`);
    await expect(carried).toBeVisible();
    await expect(carried).toHaveText('file 1');
  });

  test('the whole subtree is carried, not just the element that was tagged', async ({ page }) => {
    // Tagging every row rules out the one alternative explanation for the test
    // above — that the framework happened to re-create a single node in a way
    // that preserved an unknown attribute. A dozen carried tags cannot be a
    // coincidence.
    //
    // Scroll position was the obvious user-facing version of this claim, and it
    // is deliberately NOT tested: at this card's fixed 360px height the demo
    // content does not overflow, so the assertion would have been vacuous or
    // permanently skipped. Node identity is the property that scroll position
    // would have been standing in for, and it is asserted directly.
    const popup = await openPopup(page, PANEL_TITLE);
    const tagged = await popup.locator('.readout > div').evaluateAll((els, attr) => {
      els.forEach((el, i) => el.setAttribute(attr, `row-${i}`));
      return els.length;
    }, MOVE_TOKEN_ATTR);
    expect(tagged).toBeGreaterThan(1);

    await column(page, PANEL_TITLE).locator('.vsa-tearoff').click();

    await expect(column(page, PANEL_TITLE).locator(`[${MOVE_TOKEN_ATTR}]`)).toHaveCount(tagged);
  });
});

test.describe('tear-off — coming home', () => {
  test('the ⤓ control docks the panel and closes the window', async ({ page }) => {
    const popup = await openPopup(page, PANEL_TITLE);
    await column(page, PANEL_TITLE).locator('.vsa-tearoff').click();

    await expect
      .poll(() => popup.isClosed())
      .toBe(true);
    await expect(column(page, PANEL_TITLE).getByText('file 1', { exact: true })).toBeVisible();
  });

  test('the user closing the window docks the panel', async ({ page }) => {
    const popup = await openPopup(page, PANEL_TITLE);
    await popup.close();

    await expect(column(page, PANEL_TITLE).getByText('file 1', { exact: true })).toBeVisible();
  });

  test('two panels tear off into independent windows', async ({ page }) => {
    const first = await openPopup(page, PANEL_TITLE);
    // Properties is closed by default in this card; open it from the rail before
    // its column (and so its title bar) exists.
    await railDock(page).getByRole('tab', { name: 'Properties' }).click();
    const second = await openPopup(page, 'Properties');

    expect(first).not.toBe(second);
    await expect(first.getByText('file 1', { exact: true })).toBeVisible();
    await expect(second.getByText('prop 1', { exact: true })).toBeVisible();

    // Closing one must not disturb the other.
    await first.close();
    await expect(second.getByText('prop 1', { exact: true })).toBeVisible();
    expect(second.isClosed()).toBe(false);
  });
});

test.describe('tear-off — the opener dying', () => {
  // A popup outliving its opener still PAINTS, but its reactive graph is gone — a
  // frozen screenshot that looks live and accepts clicks that do nothing. There
  // are two distinct ways the opener can die, they run through different code,
  // and each needs its own test.

  test('an SPA route change unmounts the group and takes its popups', async ({ page }) => {
    // No document unload here — the page swaps a component. Only the group's own
    // `onCleanup -> dockAll` can catch this, so this is the sole test that
    // exercises that path.
    //
    // Navigating to `#/` would NOT do it: the router resolves an unknown hash to
    // PAGES[0], which is this very page. It has to be a genuinely different one.
    const popup = await openPopup(page, PANEL_TITLE);
    await page.goto('/#/collapsible');

    await expect.poll(() => popup.isClosed()).toBe(true);
  });

  test('reloading the opener takes the popup with it', async ({ page }) => {
    // The whole-document teardown, caught by the `beforeunload` / `pagehide`
    // listeners rather than by component cleanup.
    const popup = await openPopup(page, PANEL_TITLE);
    await page.reload();

    await expect.poll(() => popup.isClosed()).toBe(true);
  });
});
