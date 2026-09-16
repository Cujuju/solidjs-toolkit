import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// jest-dom is a REQUIRED devDependency: vite-plugin-solid auto-injects it into setupFiles.
// `.tsx` included because tests mount real components (controlled mode lives in context).
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
