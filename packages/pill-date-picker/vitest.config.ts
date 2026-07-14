import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// jsdom + the solid plugin, so the component's own behaviour is testable and not just the
// pure `_internal` modules. Note `@testing-library/jest-dom` is a REQUIRED devDependency
// even though no test imports it: vite-plugin-solid auto-injects it into setupFiles, and
// vitest fails to boot if it cannot resolve (same note as pill-number-picker's config).
//
// Tests render via `render` from `solid-js/web` and dispose by hand — NOT
// @solidjs/testing-library, which resolves a second copy of Solid. Two Solid instances =
// two ownership graphs, and the component's <Portal> then survives the test harness's
// teardown, leaving stale pop-outs in <body> for the next test to trip over.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    // `solid` first so the kv-tooltip peer resolves to ITS SOURCE rather than its built
    // dist — one Solid instance, and a sibling's un-built dist can never fail the suite.
    conditions: ['solid', 'development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
});
