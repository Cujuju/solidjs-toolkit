import { libTest } from '../_shared/vitest.base.config';

// Node 25+ has its own localStorage global, which hides jsdom's; turn it off where the flag exists.
const NODE_WEBSTORAGE = process.allowedNodeEnvironmentFlags.has('--experimental-webstorage');

export default libTest(__dirname, {
  // No JSX, and no jest-dom devDependency for vite-plugin-solid to auto-inject.
  plugins: [],
  test: {
    include: ['src/__tests__/**/*.test.ts', 'node/__tests__/**/*.test.mjs'],
    ...(NODE_WEBSTORAGE && { execArgv: ['--no-experimental-webstorage'] }),
  },
});
