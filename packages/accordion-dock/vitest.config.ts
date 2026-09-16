import { libTest } from '../_shared/vitest.base.config';

// Base conditions add the same `solid` condition a consuming app's dev server uses: without it the run
// resolves siblings' built `dist/` instead of `src/`, and reactivity breaks across the
// package boundary.
// Base `css: true`: Vitest stubs stylesheets by default. Wrong here: `domContract.test.tsx` reads them as
// TEXT, and against a stub it finds no selectors and passes while checking nothing.
export default libTest(__dirname, {
  resolve: {
    dedupe: ['solid-js'],
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/__tests__/**/*.test.ts?(x)'],
  },
});
