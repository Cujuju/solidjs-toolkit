import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the accordion-dock mock. vitest owns the PURE RULES; this suite owns
 * whatever needs a layout engine or a second document — drags, flyout overlay, rail overflow,
 * tear-off.
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
