/**
 * Shared Vite library-build config for the cujuju-solidjs-* packages.
 *
 * Each package's own vite.config.ts is a 2-line shim:
 *
 *   import { libConfig } from '../_shared/vite.lib.config';
 *   export default libConfig(__dirname);
 *
 * This eliminates 8-way duplication of build config and ensures every
 * package builds with the same Solid JSX transform, externals, and
 * output shape.
 *
 * Why Vite + vite-plugin-solid (not tsup/esbuild):
 *   - Solid requires its own JSX transform (babel-preset-solid → template())
 *     to produce reactive components. esbuild's default JSX loader
 *     transforms to React.createElement, which breaks at runtime.
 *   - vite-plugin-solid runs the same transform as the monorepo dev pipeline
 *     (client-solid + vite-plugin-solid), so the published artifact is
 *     consistent with what's tested locally.
 *   - tsup-with-babel-preset-solid works but adds a layer; Vite's library
 *     mode is the standard Solid-ecosystem pattern.
 *
 * Output:
 *   dist/index.js     — ESM bundle, JSX transformed via vite-plugin-solid
 *   dist/index.d.ts   — TypeScript declarations (via vite-plugin-dts)
 *   dist/index.js.map — source map for debugging
 *
 * Externals: solid-js / solid-js/web / solid-js/store stay external.
 * Each package declares solid-js as a peer dep; bundling it would inflate
 * artifacts and break Solid's reactive context (single solid-js instance
 * per app is required).
 */

import { defineConfig, type UserConfig } from 'vite';
import solid from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export function libConfig(packageDir: string): UserConfig {
  return defineConfig({
    plugins: [
      solid(),
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
      // Don't minify library output — consumers' bundlers (Vite/esbuild/etc)
      // minify the final app bundle. Skipping minification here keeps stack
      // traces readable in dev and makes diff'ing dist/ across versions
      // possible for security audits.
      minify: false,
    },
  });
}
