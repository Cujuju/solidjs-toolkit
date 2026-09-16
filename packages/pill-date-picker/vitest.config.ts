import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// jsdom + the solid plugin. `@testing-library/jest-dom` is a REQUIRED devDependency:
// vite-plugin-solid auto-injects it into setupFiles. Tests use `render` from `solid-js/web`
// — a second Solid instance leaves portalled pop-outs alive.
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
