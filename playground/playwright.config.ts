import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the vs-accordion mock.
 *
 * WHAT BELONGS HERE VS IN VITEST
 *
 * The split is by what is actually under test, not by convenience:
 *
 *   - vitest (`src/mock/**\/__tests__`) owns the PURE RULES — the visual order,
 *     the bulk-close exemption, the leaf chain, the breadcrumb path, the menu's
 *     enable/disable matrix. These take plain data and return plain data. A
 *     browser would make them slower and prove nothing extra.
 *   - this suite owns everything that needs a LAYOUT ENGINE or a second
 *     document: splitter drags, the auto-hide flyout overlaying real columns,
 *     the rail's measurement-driven overflow, and tear-off's cross-document
 *     rendering.
 *
 * The second list is precisely where the jsdom tests needed hand-built fakes —
 * a stub `window.open`, a stub `ResizeObserver`, hand-written
 * `getBoundingClientRect` values. Every one of those fakes is an assumption
 * about how a browser behaves, asserted by the same person who wrote the code.
 * Here the browser answers instead.
 */

/** Distinct from the 5199 the playground's own `pnpm dev` uses, so a test run can
 *  never adopt — or fight — a dev server someone is actively looking at. */
const E2E_PORT = 5300;

export default defineConfig({
  testDir: './e2e',
  // Popup and drag specs manipulate real window/pointer state, and two workers
  // racing for the OS focus that `window.open` needs is a flake source with no
  // diagnostic value.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    // Kept only for failures: a trace per passing test is pure disk.
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The system Chrome, because this machine already has one and the
        // popup-window behaviour under test (real OS windows, real popup
        // blocking) is a property of a real browser build.
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    // Playwright owns this server for the duration of the run and tears it down
    // after. It is deliberately NOT the dev server the user runs by hand.
    command: `npx vite --port ${E2E_PORT} --strictPort`,
    port: E2E_PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
