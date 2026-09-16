import { libTest } from '../_shared/vitest.base.config';

// jsdom + the solid plugin. `@testing-library/jest-dom` is a REQUIRED devDependency:
// vite-plugin-solid auto-injects it into setupFiles. Tests use `render` from `solid-js/web`
// — a second Solid instance leaves portalled pop-outs alive.
// Base conditions put `solid` first so the kv-tooltip peer resolves to ITS SOURCE rather than its built
// dist — one Solid instance, and a sibling's un-built dist can never fail the suite.
export default libTest(__dirname);
