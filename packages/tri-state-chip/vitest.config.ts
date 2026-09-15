import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    // Stylesheets load for real (default is an empty stub) so CSS-contract tests read actual rules.
    css: true,
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
});
