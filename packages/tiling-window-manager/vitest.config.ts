import { libTest } from '../_shared/vitest.base.config';

export default libTest(__dirname, {
  resolve: {
    dedupe: ['solid-js'],
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/__tests__/**/*.test.ts?(x)'],
  },
});
