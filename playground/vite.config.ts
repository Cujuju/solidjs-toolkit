import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    // The packages' `exports` carry a `solid` condition pointing at `./src/index.ts`, so the
    // playground compiles each package FROM SOURCE — an edit hot-reloads with no build or link.
    conditions: ['solid', 'development', 'browser'],
    // One Solid instance, or reactivity silently breaks across the package boundary.
    dedupe: ['solid-js'],
  },
  server: {
    port: 5199,
    open: true,
  },
  test: {
    // Playwright specs in e2e/ match vitest's default include and would otherwise be collected.
    include: ['src/__tests__/**/*.test.ts'],
  },
});
