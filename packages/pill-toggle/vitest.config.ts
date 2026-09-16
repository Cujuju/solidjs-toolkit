import { libTest } from '../_shared/vitest.base.config';

// Base `css: true`: Vitest stubs .css to empty by default; styles.contract.test.ts reads styles.css as text.
export default libTest(__dirname, {
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
