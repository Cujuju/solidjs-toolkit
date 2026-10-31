/**
 * Shared Vitest config; each package's vitest.config.ts is `libTest(__dirname, overrides?)`.
 * Overrides deep-merge (vite `mergeConfig`), except `plugins` and `test.include`, which replace the defaults.
 * Two projects: `dom` (the overrides apply here) and `ssr` (`*.ssr.test.tsx`).
 */

import { mergeConfig, type UserConfig } from 'vite';
import solid from 'vite-plugin-solid';

// vitest is not resolvable from _shared (no root devDependency), so its `test` type is declared loosely here.
export type LibTestConfig = UserConfig & { test?: { include?: string[]; [option: string]: unknown } };

const DEFAULT_TEST_INCLUDE = ['src/__tests__/**/*.test.{ts,tsx}'];
// Repo-wide contracts run in every package against its own `src`, whatever `include` it overrides.
const CONTRACT_TEST_INCLUDE = ['../_shared/contracts/*.test.ts'];
// Server-render tests run in their own project: compiled for SSR, against solid-js's server build, in node.
const SSR_TEST_INCLUDE = ['src/__tests__/**/*.ssr.test.{ts,tsx}'];

export function libTest(packageDir: string, overrides: LibTestConfig = {}): LibTestConfig {
  // No HMR: Vitest runs Vite as a dev server, and Vitest 4 cannot load the `/@solid-refresh` runtime HMR injects.
  const { plugins = [solid({ hot: false })], test = {}, ...rest } = overrides;
  const { include = DEFAULT_TEST_INCLUDE, ...testOverrides } = test;
  const base: LibTestConfig = {
    root: packageDir,
    plugins,
    resolve: {
      // `solid` first so sibling packages resolve to their `src/`, not a built `dist/`: one Solid instance.
      conditions: ['solid', 'development', 'browser'],
    },
    test: {
      environment: 'jsdom',
      // Vitest stubs stylesheets as empty by default; CSS-contract tests need the real text.
      css: true,
      name: 'dom',
      include: [...include, ...CONTRACT_TEST_INCLUDE],
      exclude: SSR_TEST_INCLUDE,
      env: { PACKAGE_DIR: packageDir },
      server: {
        deps: {
          // Inline testing-library too: externalised, Node ESM loads solid-js/web's server build,
          // so `render` owns nothing and cleanup() never disposes the component.
          inline: ['solid-js', '@solidjs/testing-library'],
        },
      },
    },
  };
  const dom = mergeConfig(base, { ...rest, test: testOverrides });
  const ssr: LibTestConfig = {
    root: packageDir,
    // `ssr: true` also makes client output hydratable, so it stays out of the dom project.
    plugins: [solid({ ssr: true, hot: false })],
    test: { name: 'ssr', environment: 'node', include: SSR_TEST_INCLUDE },
  };
  return { test: { projects: [dom, ssr] } };
}
