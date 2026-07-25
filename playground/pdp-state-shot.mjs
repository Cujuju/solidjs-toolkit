/**
 * pdp-state-shot.mjs — drive the playground to prove the new row states behave,
 * not just compile. Screenshots the open ladder and asserts the interaction
 * rules that a unit test cannot show you: what the thing LOOKS like in each
 * state, and that the disabled row is inert against a real click.
 *
 * Run from the repo root with the playground dev server up:
 *   node playground/pdp-state-shot.mjs            (PORT=5201 by default)
 */
// Playwright is not a dependency of this repo — the toolkit ships no browser
// tests. Resolved from a sibling checkout that has it (override with
// PLAYWRIGHT_FROM) so this stays a hand-run verification script, not a new
// devDependency on every contributor's install.
import { createRequire } from 'node:module';
const from = process.env.PLAYWRIGHT_FROM || 'E:/Development/Projects/StockApp/client-solid/';
const { chromium } = createRequire(from)('playwright');

const PORT = process.env.PORT || '5201';
const URL = `http://localhost:${PORT}/#pill-date-picker`;
const OUT = process.env.OUT || 'playground';
const log = (m) => console.log(m);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
page.on('pageerror', (e) => log('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE ' + m.text().slice(0, 160)); });

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(600);

  // The state card is the first picker under the "Per-row state" heading.
  const card = page.locator('.card', { hasText: 'one rule, three states' });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/pdp-state-0-page.png` });

  await card.locator('.cpdp-pill').click();
  await page.waitForTimeout(400);

  const rows = page.locator('.cpdp-popout .cpdp-row');
  const n = await rows.count();
  const states = [];
  for (let i = 0; i < n; i++) {
    states.push({
      text: (await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim(),
      state: await rows.nth(i).getAttribute('data-state'),
      ariaDisabled: await rows.nth(i).getAttribute('aria-disabled'),
    });
  }
  log('ROWS ' + JSON.stringify(states, null, 1));
  await page.screenshot({ path: `${OUT}/pdp-state-1-ladder.png` });

  const tiers = new Set(states.map((s) => s.state));
  log('TIERS PRESENT ' + [...tiers].join(', '));
  if (!tiers.has('available') || !tiers.has('adjusted') || !tiers.has('disabled')) {
    throw new Error('the demo does not exercise all three states');
  }

  // A real click on the disabled row must do nothing AND leave the panel open.
  const disabledIdx = states.findIndex((s) => s.state === 'disabled');
  const readoutBefore = await card.locator('.readout').innerText();
  await rows.nth(disabledIdx).click({ force: true });
  await page.waitForTimeout(300);
  const stillOpen = (await page.locator('.cpdp-popout').count()) > 0;
  const readoutAfter = await card.locator('.readout').innerText();
  log(`DISABLED CLICK → panel still open: ${stillOpen} · readout unchanged: ${readoutBefore === readoutAfter}`);
  if (!stillOpen || readoutBefore !== readoutAfter) throw new Error('disabled row was not inert');

  // The adjusted row IS pickable, and the pick reports the moved strike.
  const adjustedIdx = states.findIndex((s) => s.state === 'adjusted');
  await rows.nth(adjustedIdx).click();
  await page.waitForTimeout(400);
  log('AFTER ADJUSTED PICK → ' + (await card.locator('.readout').innerText()).replace(/\s+/g, ' '));
  await page.screenshot({ path: `${OUT}/pdp-state-2-picked.png` });

  // renderRow card — custom content inside the package's own row element.
  const rich = page.locator('.card', { hasText: 'a third column' });
  await rich.scrollIntoViewIfNeeded();
  await rich.locator('.cpdp-pill').click();
  await page.waitForTimeout(400);
  const richRow = page.locator('.cpdp-popout .cpdp-row').first();
  log('RENDERROW ROW ' + (await richRow.innerText()).replace(/\s+/g, ' '));
  log('RENDERROW keeps role=option: ' + (await richRow.getAttribute('role')));
  await page.screenshot({ path: `${OUT}/pdp-state-3-renderrow.png` });

  // Cursor liveness: arrow down through the ctx.active card.
  await page.keyboard.press('Escape');
  const live = page.locator('.card', { hasText: 'ctx.active' });
  await live.scrollIntoViewIfNeeded();
  await live.locator('.cpdp-pill').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const cursorRows = await page.locator('.cpdp-popout .cpdp-row').allInnerTexts();
  log('CURSOR ROWS ' + JSON.stringify(cursorRows.map((t) => t.replace(/\s+/g, ' '))));
  await page.screenshot({ path: `${OUT}/pdp-state-4-cursor.png` });

  log('RESULT ok');
} catch (err) {
  log('FAILED ' + (err?.message ?? String(err)));
  await page.screenshot({ path: `${OUT}/pdp-state-error.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
