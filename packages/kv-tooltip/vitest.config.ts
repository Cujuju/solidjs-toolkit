import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// Dual-environment setup:
//   - Pure-helper tests (hoverIntent.test.ts) run in node and don't need DOM
//   - Integration tests (KvTooltip.integration.test.ts) mount the JSX
//     component in jsdom — these exercise the contract between the helper
//     and the JSX wiring, which the unit tests can't catch alone.
//
// vite-plugin-solid auto-detects @testing-library/jest-dom for setupFiles;
// since we have it installed, the auto-injection resolves cleanly.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts'],
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
});
