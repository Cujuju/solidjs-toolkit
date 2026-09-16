import { libTest } from '../_shared/vitest.base.config';

export default libTest(__dirname, {
  // No JSX, and no jest-dom devDependency for vite-plugin-solid to auto-inject.
  plugins: [],
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
