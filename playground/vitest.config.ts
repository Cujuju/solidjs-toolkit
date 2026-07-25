import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    // Same `solid` condition the dev server uses (see vite.config.ts): the mock
    // imports @cujuju/solidjs-context-menu and @cujuju/solidjs-hooks, and without
    // this the test run would resolve their built `dist/` instead of `src/` — so a
    // test could pass against a stale build of a package the playground consumes
    // from source. One instance of solid-js, or reactivity breaks across the
    // package boundary exactly as it would in the browser.
    conditions: ['solid', 'development', 'browser'],
    dedupe: ['solid-js'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Scoped to the mock rather than all of src/: the pages/ tree is a demo
    // harness, and a glob that invites tests there would encourage testing the
    // demo instead of the control.
    include: ['src/mock/**/__tests__/**/*.test.ts?(x)'],
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
});
