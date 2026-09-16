import { libTest } from '../_shared/vitest.base.config';

// jest-dom is a REQUIRED devDependency: vite-plugin-solid auto-injects it into setupFiles.
// `.tsx` included (base default) because tests mount real components (controlled mode lives in context).
export default libTest(__dirname);
