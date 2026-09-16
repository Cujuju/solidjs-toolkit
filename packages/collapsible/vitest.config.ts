import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    // Vitest stubs stylesheets as empty by default; styles.test.ts needs the real text.
    css: true,
    include: ['src/__tests__/**/*.test.ts'],
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
});
