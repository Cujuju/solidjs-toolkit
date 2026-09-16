/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { injectCssImport } from '../../../packages/_shared/injectCssImport';

/**
 * Repo-wide CSS packaging contract: `solid` needs src/index.ts in `sideEffects`, `import` needs
 * dist/index.js to import dist/style.css and that file exported.
 */

interface Manifest {
  sideEffects?: boolean | string[];
  exports?: Record<string, unknown>;
}

const SOURCE_ENTRY = './src/index.ts';
const DIST_ENTRY = './dist/index.js';
const STYLESHEET_EXPORT = './style.css';
const DIST_STYLESHEET = './dist/style.css';
const SIDE_EFFECT_IMPORT = /^\s*import\s+['"][^'"]+['"]/m;
const LOCAL_CSS_IMPORT = /^\s*import\s+['"]\.\/([^'"]+\.css)['"]/gm;

const MANIFESTS = import.meta.glob<Manifest>('../../../packages/*/package.json', {
  import: 'default',
  eager: true,
});
const ENTRIES = import.meta.glob<string>('../../../packages/*/src/index.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const STYLESHEET_PATHS = Object.keys(import.meta.glob('../../../packages/*/src/**/*.css'));

const packageDir = (path: string) => path.split('/package.json')[0];
const packageName = (path: string) => packageDir(path).split('/').pop();

const packages = Object.entries(MANIFESTS).map(([path, manifest]) => {
  const dir = packageDir(path);
  const entry = ENTRIES[`${dir}/src/index.ts`] ?? '';
  return {
    name: packageName(path),
    manifest,
    entryHasSideEffectImport: SIDE_EFFECT_IMPORT.test(entry),
    entryStylesheets: Array.from(entry.matchAll(LOCAL_CSS_IMPORT), (m) => `./src/${m[1]}`),
    sourceStylesheets: STYLESHEET_PATHS.filter((css) => css.startsWith(`${dir}/src/`)).map(
      (css) => `./${css.slice(dir.length + 1)}`,
    ),
  };
});

type Package = (typeof packages)[number];

describe('CSS packaging contract', () => {
  it('discovers the workspace packages', () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  it.each(packages.filter((p) => p.entryHasSideEffectImport).map((p) => [p.name, p]))(
    '%s: sideEffects keeps the entry under both export conditions',
    (_name, p) => {
      expect((p as Package).manifest.sideEffects).toEqual(
        expect.arrayContaining([SOURCE_ENTRY, DIST_ENTRY]),
      );
    },
  );

  // Keyed on the entry loading CSS, which is what makes the build emit dist/style.css.
  // A src sheet no module imports would emit nothing and leave this export dangling.
  it.each(packages.filter((p) => p.entryStylesheets.length > 0).map((p) => [p.name, p]))(
    '%s: exports the built stylesheet',
    (_name, p) => {
      expect((p as Package).manifest.exports?.[STYLESHEET_EXPORT]).toBe(DIST_STYLESHEET);
    },
  );

  // `exports` seals unlisted subpaths, so an unexported source sheet cannot be ordered
  // explicitly — including ones reached through a component rather than the entry.
  it.each(packages.filter((p) => p.sourceStylesheets.length > 0).map((p) => [p.name, p]))(
    '%s: every source stylesheet is an exports target',
    (_name, p) => {
      const { manifest, sourceStylesheets } = p as Package;
      expect(Object.values(manifest.exports ?? {})).toEqual(
        expect.arrayContaining(sourceStylesheets),
      );
    },
  );
});

type BundleFile = { type: string; fileName: string; [key: string]: unknown };

/** Minimal rollup plugin context: entry import order plus a throwing `error`. */
function runInjection(
  bundle: Record<string, BundleFile>,
  modules: Record<string, { importedIds?: string[]; isExternal?: boolean }>,
) {
  const context = {
    getModuleInfo: (id: string) => modules[id] ?? null,
    error: (message: string) => {
      throw new Error(message);
    },
  };
  const hook = injectCssImport().generateBundle as unknown as (...args: unknown[]) => void;
  hook.call(context, { sourcemap: true }, bundle, false);
}

const MAPPINGS = 'AAAA;AACA;AAEA';
const SOLID_IMPORT = 'import { insert } from "solid-js/web";';
const GLASS_IMPORT = 'import "@cujuju/solidjs-glass";';
const CSS_IMPORT = "import './style.css';";

function entryBundle(code: string) {
  return {
    'index.js': {
      type: 'chunk',
      isEntry: true,
      fileName: 'index.js',
      facadeModuleId: '/src/index.ts',
      code,
    },
    'index.js.map': {
      type: 'asset',
      fileName: 'index.js.map',
      source: JSON.stringify({ mappings: MAPPINGS }),
    },
    'style.css': { type: 'asset', fileName: 'style.css', source: '.x{}' },
  } as Record<string, BundleFile>;
}

const mappingsOf = (bundle: Record<string, BundleFile>) =>
  JSON.parse(String(bundle['index.js.map'].source)).mappings;

describe('injectCssImport', () => {
  it('runs after vite:css-post has emitted the sheet, and only on builds', () => {
    const plugin = injectCssImport();
    expect(plugin.enforce).toBe('post');
    expect(plugin.apply).toBe('build');
  });

  it('puts the sheet first when the entry imports it first', () => {
    const bundle = entryBundle(`${SOLID_IMPORT}\nexport {};\n`);
    runInjection(bundle, {
      '/src/index.ts': { importedIds: ['/src/own.css', '/src/Own.tsx'] },
      'solid-js/web': { isExternal: true },
    });
    expect(bundle['index.js'].code).toBe(`${CSS_IMPORT}\n${SOLID_IMPORT}\nexport {};\n`);
    expect(mappingsOf(bundle)).toBe(`;${MAPPINGS}`);
  });

  it('keeps a dependency the entry imports first above the sheet', () => {
    const bundle = entryBundle(`${GLASS_IMPORT}\n${SOLID_IMPORT}\nexport {};\n`);
    runInjection(bundle, {
      '/src/index.ts': {
        importedIds: ['@cujuju/solidjs-glass', '/src/own.css', '/src/Own.tsx'],
      },
      '@cujuju/solidjs-glass': { isExternal: true },
      'solid-js/web': { isExternal: true },
    });
    expect(bundle['index.js'].code).toBe(
      `${GLASS_IMPORT}\n${CSS_IMPORT}\n${SOLID_IMPORT}\nexport {};\n`,
    );
    expect(mappingsOf(bundle)).toBe(MAPPINGS.replace(';', ';;'));
  });

  it('refuses a bundle it cannot attribute a sheet in', () => {
    const bundle = entryBundle(`${SOLID_IMPORT}\n`);
    bundle['chunk2.js'] = { type: 'chunk', isEntry: true, fileName: 'chunk2.js', code: '' };
    expect(() => runInjection(bundle, {})).toThrow(/one entry chunk and one CSS asset/);
  });
});
