/**
 * Type-checks the built package as a NodeNext consumer (#29, #30). Run from a package dir after `vite build`.
 * skipLibCheck is off, so an unresolved .d.ts import fails (TS2834) instead of silently becoming `any`.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const packageDir = process.cwd();
const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
// Stylesheet subpaths carry no `types`; every typed subpath is checked.
const typedSubpaths = Object.entries(pkg.exports ?? {})
  .filter(([, target]) => typeof target === 'object' && target !== null && 'types' in target)
  .map(([subpath]) => subpath);
if (typedSubpaths.length === 0) throw new Error(`${pkg.name}: no typed export subpaths to check`);

const toPosix = (file) => file.replaceAll('\\', '/');
// Inside the package so its name self-references through `exports`; .mts so it is ESM.
const consumerPath = toPosix(join(packageDir, '__nodenext_consumer__.mts'));
const consumerText = typedSubpaths
  .map((subpath, i) => `export * as entry${i} from '${pkg.name}${subpath.slice(1)}';`)
  .join('\n');

const { options, errors } = ts.convertCompilerOptionsFromJson(
  {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    skipLibCheck: false,
    noEmit: true,
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

const program = ts.createProgram([consumerPath], options, host);
const diagnostics = [...errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  console.error(`${pkg.name}: types do not resolve for a NodeNext consumer.`);
  process.exit(1);
}
console.log(`${pkg.name}: NodeNext consumer check passed (${typedSubpaths.join(', ')}).`);
