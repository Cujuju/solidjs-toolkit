import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    // The same `solid` condition a consuming app's dev server uses: without it the run
        // resolves siblings' built `dist/` instead of `src/`, and reactivity breaks across the
        // package boundary.
    conditions: ['solid', 'development', 'browser'],
    dedupe: ['solid-js'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    /*
         * Vitest stubs stylesheets by default. Wrong here: `domContract.test.tsx` reads them as
         * TEXT, and against a stub it finds no selectors and passes while checking nothing.
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
