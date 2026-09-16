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
        inline: ['solid-js'],
      },
    },
  },
});
