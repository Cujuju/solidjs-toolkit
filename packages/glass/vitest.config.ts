import { libTest } from '../_shared/vitest.base.config';

// Base `css: true`: Vitest stubs stylesheets as empty by default; cssCascade.test.ts needs the real text.
export default libTest(__dirname);
