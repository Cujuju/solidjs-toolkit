import { libConfig } from '../_shared/vite.lib.config';

// Externalize sibling `@cujuju/*` packages — a consumer provides them,
// so bundling here would duplicate code. Solid externals come from
// `libConfig`.
const config = libConfig(__dirname);
const rollup = config.build!.rollupOptions!;
rollup.external = [...(rollup.external as string[]), /^@cujuju\//];

export default config;
