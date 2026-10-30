/**
 * Shared Vite library-build config; each package's vite.config.ts is `libConfig(__dirname)`.
 * Vite + vite-plugin-solid because Solid needs its own JSX transform (esbuild's React one
 * breaks Solid). solid-js stays external — one instance per app.
 */
/** Output is flat: dist/index.js(.map), dist/index.d.ts and dist/style.css, whose import injectCssImport splices in.
 *  Each extra entry adds dist/<name>.js. */

import { defineConfig, type UserConfig } from 'vite';
import solid from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';
import { injectCssImport, MAIN_ENTRY } from './injectCssImport';

export interface LibOptions {
  /** Extra entry points, name → path under src/, built to dist/<name>.js without the stylesheet. */
  extraEntries?: Record<string, string>;
}

export function libConfig(packageDir: string, options: LibOptions = {}): UserConfig {
  const extra = Object.entries(options.extraEntries ?? {}).map(([name, path]) => [name, resolve(packageDir, 'src', path)]);
  return defineConfig({
    plugins: [
      solid(),
      injectCssImport(),
      // Generate .d.ts files alongside compiled JS. rollupTypes: false keeps
      // declarations as separate files matching source structure (matches
      // tsc's default behavior; rolling up adds complexity without benefit
      // for these small packages).
      dts({
        rollupTypes: false,
        include: ['src/**/*'],
        exclude: ['src/__tests__/**', 'src/**/*.test.ts'],
      }),
    ],
    build: {
      lib: {
        entry: { [MAIN_ENTRY]: resolve(packageDir, 'src/index.ts'), ...Object.fromEntries(extra) },
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
        // Vite 6+ names it after the package; the exports and injectCssImport expect style.css.
        cssFileName: 'style',
      },
      rollupOptions: {
        // Solid + its sub-modules stay external. Anything else bundled.
        external: ['solid-js', 'solid-js/web', 'solid-js/store'],
      },
      emptyOutDir: true,
      sourcemap: true,
      // Don't minify library output — consumers' bundlers minify the app bundle. Readable stack
      // traces in dev, and dist/ diffs stay reviewable for audits.
      minify: false,
    },
  });
}
