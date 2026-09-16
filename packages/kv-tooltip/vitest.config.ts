import { libTest } from '../_shared/vitest.base.config';

// Pure-helper and integration tests both run in jsdom (base config).
export default libTest(__dirname, {
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
