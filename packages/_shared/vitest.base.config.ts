/**
 * Shared Vitest config; each package's vitest.config.ts is `libTest(__dirname, overrides?)`.
 * Overrides deep-merge (vite `mergeConfig`), except `plugins` and `test.include`, which replace the defaults.
 */

import { mergeConfig, type UserConfig } from 'vite';
import solid from 'vite-plugin-solid';

// vitest is not resolvable from _shared (no root devDependency), so its `test` type is declared loosely here.
export type LibTestConfig = UserConfig & { test?: { include?: string[]; [option: string]: unknown } };

const DEFAULT_TEST_INCLUDE = ['src/__tests__/**/*.test.{ts,tsx}'];

export function libTest(packageDir: string, overrides: LibTestConfig = {}): LibTestConfig {
  const { plugins = [solid()], test = {}, ...rest } = overrides;
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
      include,
      server: {
        deps: {
          // Inline testing-library too: externalised, Node ESM loads solid-js/web's server build,
          // so `render` owns nothing and cleanup() never disposes the component.
          inline: ['solid-js', '@solidjs/testing-library'],
        },
      },
    },
  };
  return mergeConfig(base, { ...rest, test: testOverrides });
}
