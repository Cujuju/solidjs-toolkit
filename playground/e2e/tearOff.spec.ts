import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Tear-off in a real browser. jsdom stubs `window.open` and has no layout, so its cross-document
 * assertions tested the fake. Here: a real popup, nodes MOVED not re-created, cloned CSS
 * painting.
 */

const RAIL_DOCK = '[aria-label="Horizontal rail dock"]';
const PANEL_TITLE = 'Solution Explorer';

/** Marker written onto a live node inside the popup, then looked for in the dock. Invisible to
 *  the framework, so it survives only if the ELEMENT did. */
const MOVE_TOKEN_ATTR = 'data-e2e-move-token';

function railDock(page: Page): Locator {
  return page.locator(RAIL_DOCK);
}

/** The column whose title bar carries `title`. Panels expose no id attribute, so
 *  the title bar is the stable handle — and it is also what a user reads. */
function column(page: Page, title: string): Locator {
  return railDock(page)
    .locator('.acc-panel')
    .filter({ has: page.locator('.acc-col-bar .acc-title', { hasText: title }) });
}

async function openPopup(page: Page, title: string): Promise<Page> {
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    column(page, title).locator('.acc-tearoff').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  return popup;
}

test.beforeEach(async ({ page }) => {
  // The rail card persists its layout under `playground:acc:rail`, and tear-off
  // persists window geometry — without this, state leaks between tests and the
  // first failure cascades into the rest.
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto('/#/accordion-dock');
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
    // Regression. `syncStyles` removed any attribute the opener lacked — including `style`, since
    // a plain <body> has none — wiping the frame set moments earlier. Asserted on COMPUTED style.
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
    // jsdom clones style nodes without applying them, so `syncStyles` was unfalsifiable there. A
    // padding that resolves can only come from the cloned `--acc-content-pad`.
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
    // THE test. The stay-mounted rule, the scroll-position promise and the in-flight-edit promise
    // all reduce to one claim: docking re-parents the SAME elements.
    const popup = await openPopup(page, PANEL_TITLE);
    await popup
      .getByText('file 1', { exact: true })
      .evaluate((el, attr) => el.setAttribute(attr, 'carried'), MOVE_TOKEN_ATTR);

    await column(page, PANEL_TITLE).locator('.acc-tearoff').click();

    const carried = column(page, PANEL_TITLE).locator(`[${MOVE_TOKEN_ATTR}="carried"]`);
    await expect(carried).toBeVisible();
    await expect(carried).toHaveText('file 1');
  });

  test('the whole subtree is carried, not just the element that was tagged', async ({ page }) => {
    // Tagging every row rules out the framework re-creating a single node in a way that preserved
    // an unknown attribute. Scroll position is deliberately not tested: this card's content
    // never overflows.
    const popup = await openPopup(page, PANEL_TITLE);
    const tagged = await popup.locator('.readout > div').evaluateAll((els, attr) => {
      els.forEach((el, i) => el.setAttribute(attr, `row-${i}`));
      return els.length;
    }, MOVE_TOKEN_ATTR);
    expect(tagged).toBeGreaterThan(1);

    await column(page, PANEL_TITLE).locator('.acc-tearoff').click();

    await expect(column(page, PANEL_TITLE).locator(`[${MOVE_TOKEN_ATTR}]`)).toHaveCount(tagged);
  });
});

test.describe('tear-off — coming home', () => {
  test('the ⤓ control docks the panel and closes the window', async ({ page }) => {
    const popup = await openPopup(page, PANEL_TITLE);
    await column(page, PANEL_TITLE).locator('.acc-tearoff').click();

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
  // A popup outliving its opener still PAINTS, but its reactive graph is gone — a frozen
  // screenshot that accepts dead clicks. Two distinct death paths, each needing its own test.

  test('an SPA route change unmounts the group and takes its popups', async ({ page }) => {
    // No document unload — the page swaps a component, so only the group's `onCleanup -> dockAll`
    // catches it. `#/` would not do: the router resolves unknown hashes to this page.
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
