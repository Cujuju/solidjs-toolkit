import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// jsdom + the solid plugin. `@testing-library/jest-dom` is a REQUIRED devDependency even though
// no test imports it: vite-plugin-solid auto-injects it into setupFiles, and vitest fails to boot
// if it cannot resolve (same note as pill-toggle's config).
//
// `.tsx` is included in the glob (pill-toggle's config is `.ts`-only) because these tests mount
// the real components — SegGroup's controlled mode lives in a context provider, and a test that
// does not render JSX cannot see it.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
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
