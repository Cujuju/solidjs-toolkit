import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    // The packages' `exports` maps carry a `solid` condition pointing at `./src/index.ts`.
    // Resolving through it means the playground compiles each package FROM SOURCE — so an
    // edit in packages/*/src hot-reloads here instantly. No build, no publish, no linking
    // into a consuming app to see a change.
    conditions: ['solid', 'development', 'browser'],
    // One Solid instance, or reactivity silently breaks across the package boundary.
    dedupe: ['solid-js'],
  },
  server: {
    port: 5199,
    open: true,
  },
});
