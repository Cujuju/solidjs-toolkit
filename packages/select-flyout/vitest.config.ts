import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// happy-dom, not jsdom: focus-after-paint tests rely on its deterministic rAF / effect-flush
// ordering after afterPaint and AnchoredPopover's measure.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'happy-dom',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
});
