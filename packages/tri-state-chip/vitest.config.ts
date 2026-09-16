import { libTest } from '../_shared/vitest.base.config';

// Base `css: true`: stylesheets load for real (default is an empty stub) so CSS-contract tests read actual rules.
export default libTest(__dirname);
