import { libTest } from '../_shared/vitest.base.config';

// Base inlines @solidjs/testing-library: externalised, it loads a second Solid instance,
// so `render` owns nothing and cleanup() never disposes the component.
export default libTest(__dirname);
