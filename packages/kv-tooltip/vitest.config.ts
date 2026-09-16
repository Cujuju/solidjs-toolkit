import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// Pure-helper tests run in node; integration tests mount JSX in jsdom.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['solid', 'development', 'browser'],
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
