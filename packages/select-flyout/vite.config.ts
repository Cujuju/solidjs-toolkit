import { libConfig } from '../_shared/vite.lib.config';

// Externalize sibling `@cujuju/*` packages — a consumer provides them
// (anchored-popover, glass-menu, hooks), so bundling here would
// duplicate code and, for `solidjs-glass`, the glass stylesheet pulled
// transitively through `glass-menu`. Solid externals are already set
// by `libConfig`.
const config = libConfig(__dirname);
const rollup = config.build!.rollupOptions!;
rollup.external = [...(rollup.external as string[]), /^@cujuju\//];

export default config;
