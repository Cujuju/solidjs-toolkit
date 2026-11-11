/**
 * Type-checks the built package as a NodeNext consumer (#29, #30). Run from a package dir after `vite build`.
 * skipLibCheck is off, so an unresolved .d.ts import fails (TS2834) instead of silently becoming `any`.
 */

import ts from 'typescript';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

const toPosix = (file) => file.replaceAll('\\', '/');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const exportEntries = (manifest) =>
  Object.entries(manifest.exports ?? {}).filter(([, target]) => typeof target === 'object' && target !== null);

const packageDir = process.cwd();
const packagesDir = dirname(packageDir);
const pkg = readJson(join(packageDir, 'package.json'));
// Stylesheet subpaths carry no `types`; every typed subpath is checked.
const typedSubpaths = exportEntries(pkg).filter(([, target]) => 'types' in target).map(([subpath]) => subpath);
if (typedSubpaths.length === 0) throw new Error(`${pkg.name}: no typed export subpaths to check`);

// Workspace dependencies (transitively) resolve to their source, as `cujuju-source` consumers do,
// so the check needs no sibling build and passes in any build order.
const paths = {};
const visited = new Set([packageDir]);
const pending = [{ dir: packageDir, manifest: pkg }];
while (pending.length > 0) {
  const { dir, manifest } = pending.pop();
  const names = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.devDependencies });
  for (const name of names.filter((n) => n.startsWith('@cujuju/'))) {
    let dependencyDir;
    try {
      dependencyDir = realpathSync(join(dir, 'node_modules', name));
    } catch {
      continue; // Not installed here: an optional peer.
    }
    if (dirname(dependencyDir) !== packagesDir || visited.has(dependencyDir)) continue;
    visited.add(dependencyDir);
    const dependency = readJson(join(dependencyDir, 'package.json'));
    pending.push({ dir: dependencyDir, manifest: dependency });
    for (const [subpath, target] of exportEntries(dependency)) {
      if (target['cujuju-source']) paths[`${name}${subpath.slice(1)}`] = [join(dependencyDir, target['cujuju-source'])];
    }
  }
}

// Inside the package so its name self-references through `exports`; .mts so it is ESM.
const consumerPath = toPosix(join(packageDir, '__nodenext_consumer__.mts'));
const consumerText = [
  'type IsAny<T> = 0 extends 1 & T ? true : false;',
  'type AnyExports<M> = { [K in keyof M]: IsAny<M[K]> extends true ? K : never }[keyof M];',
  ...typedSubpaths.flatMap((subpath, i) => [
    `import * as entry${i} from '${pkg.name}${subpath.slice(1)}';`,
    // Fails naming the export, e.g. `"createUpdater"` is not assignable to `never`.
    `export const entry${i}AnyExports: AnyExports<typeof entry${i}>[] = [];`,
    `export const entry${i}NoAnyExports: never[] = entry${i}AnyExports;`,
  ]),
].join('\n');

const { options, errors } = ts.convertCompilerOptionsFromJson(
  {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    paths,
  },
  packageDir,
);
const host = ts.createCompilerHost(options);
const { fileExists, readFile, getSourceFile } = host;
const isConsumer = (file) => toPosix(file) === consumerPath;
host.fileExists = (file) => isConsumer(file) || fileExists(file);
host.readFile = (file) => (isConsumer(file) ? consumerText : readFile(file));
host.getSourceFile = (file, languageVersion, ...rest) =>
  isConsumer(file)
    ? ts.createSourceFile(file, consumerText, languageVersion)
    : getSourceFile(file, languageVersion, ...rest);

// Only this package's declarations and the consumer: dependencies and libs answer to their own checks.
const ownDir = `${toPosix(packageDir)}/`;
const isOwn = (file) => !file || isConsumer(file.fileName) || (file.fileName.startsWith(ownDir) && !file.fileName.includes('/node_modules/'));
const program = ts.createProgram([consumerPath], options, host);
const diagnostics = [...errors, ...ts.getPreEmitDiagnostics(program).filter((d) => isOwn(d.file))];
if (diagnostics.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  console.error(`${pkg.name}: types do not resolve for a NodeNext consumer.`);
  process.exit(1);
}
console.log(`${pkg.name}: NodeNext consumer check passed (${typedSubpaths.join(', ')}).`);
