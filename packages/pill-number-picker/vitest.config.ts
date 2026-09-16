import { libTest } from '../_shared/vitest.base.config';

// Tests render via solid-js/web `render` and dispose by hand; the shared base inlines
// solid-js and @solidjs/testing-library so one Solid instance owns every Portal.
export default libTest(__dirname);
