/**
 * Shared Vite library-build config; each package's vite.config.ts is `libConfig(__dirname)`.
 * Vite + vite-plugin-solid because Solid needs its own JSX transform (esbuild's React one
 * breaks Solid). solid-js stays external — one instance per app.
 */
/** Output is flat: dist/index.js(.map), dist/index.d.ts and dist/style.css, whose import injectCssImport splices in. */

import { defineConfig, type UserConfig } from 'vite';
import solid from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';
import { injectCssImport } from './injectCssImport';

export function libConfig(packageDir: string): UserConfig {
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
        entry: resolve(packageDir, 'src/index.ts'),
        formats: ['es'],
        fileName: 'index',
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
