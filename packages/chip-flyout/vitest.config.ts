import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

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
        // Inline testing-library too: externalised, it loads a second Solid instance,
        // so `render` owns nothing and cleanup() never disposes the component.
        inline: ['solid-js', '@solidjs/testing-library'],
      },
    },
  },
});
