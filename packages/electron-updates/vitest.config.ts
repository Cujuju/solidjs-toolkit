import { libTest } from '../_shared/vitest.base.config';

// Node code: no JSX plugin, no DOM.
export default libTest(__dirname, {
  plugins: [],
  test: { environment: 'node' },
});
