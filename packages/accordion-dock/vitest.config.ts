import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    // The same `solid` condition a consuming app's dev server uses: this package
    // imports @cujuju/solidjs-anchored-popover, -context-menu and -hooks, and
    // without this the test run resolves their built `dist/` instead of `src/` —
    // so a test could pass against a stale build of a sibling. One instance of
    // solid-js, or reactivity breaks across the package boundary exactly as it
    // would in the browser.
    conditions: ['solid', 'development', 'browser'],
    dedupe: ['solid-js'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    /*
     * Vitest stubs stylesheets by default — a `.css` import resolves to an empty
     * module — which is the right default for a component test that only wants the
     * import not to explode.
     *
     * It is the wrong default here. `domContract.test.tsx` reads the stylesheets as
     * TEXT to check that every name they select is one a component actually emits;
     * against a stub it reads four empty strings, finds no selectors, and passes
     * while checking nothing. (That failure mode is itself guarded — the suite
     * asserts it found a plausible number of selectors first — which is how this
     * was noticed rather than shipped.)
     */
    css: true,
    include: ['src/__tests__/**/*.test.ts?(x)'],
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
});
