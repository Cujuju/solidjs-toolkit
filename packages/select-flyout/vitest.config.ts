import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// `happy-dom` (not `jsdom`): the Flyout test suite was authored against
// happy-dom's requestAnimationFrame / effect-flush interleave. The
// focus-after-paint assertions await a single rAF that lands after
// both the component's `afterPaint` focus call and AnchoredPopover's
// measure pass — timing that happy-dom resolves deterministically.
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
