// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkMonotonic, cspAllows, nativeFingerprint, pnpmPackages, PublishError } from '../index.mjs';

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** An app tree from { relativePath: contents }. */
function app(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clu-'));
  dirs.push(root);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

const npmLock = (packages) =>
  JSON.stringify({ packages: Object.fromEntries(Object.entries(packages).map(([k, v]) => [`node_modules/${k}`, { version: v }])) });
const base = {
  'capacitor.config.ts': 'export default {}',
  'ios/App/App/AppDelegate.swift': 'class A {}',
  'package-lock.json': npmLock({ '@capacitor/core': '8.5.2', 'solid-js': '1.9.5' }),
};

describe('pnpmPackages', () => {
  it('reads every packages: section, quoted or not, v6 or v9', () => {
    const lock = [
      "lockfileVersion: '9.0'",
      'packages:',
      '',
      "  '@capacitor/core@8.5.2':",
      '    resolution: {integrity: x}',
      '  vite@5.4.0:',
      '    resolution: {integrity: y}',
      'snapshots:',
      "  '@capgo/capacitor-updater@8.53.0(@capacitor/core@8.5.2)':",
      '---',
      'packages:',
      '  /@capgo/capacitor-updater@8.53.0:',
      '    resolution: {integrity: z}',
    ].join('\n');
    expect(pnpmPackages(lock)).toEqual([
      ['@capacitor/core', '8.5.2'],
      ['vite', '5.4.0'],
      ['@capgo/capacitor-updater', '8.53.0'],
    ]);
  });
});

describe('nativeFingerprint', () => {
  it('ignores web-only changes', () => {
    const a = app(base);
    const b = app({ ...base, 'package-lock.json': npmLock({ '@capacitor/core': '8.5.2', 'solid-js': '1.9.9' }), 'src/main.ts': 'x' });
    expect(nativeFingerprint(a)).toBe(nativeFingerprint(b));
  });

  it.each([
    ['a native plugin version', { 'package-lock.json': npmLock({ '@capacitor/core': '8.6.0', 'solid-js': '1.9.5' }) }],
    ['native code', { 'ios/App/App/AppDelegate.swift': 'class B {}' }],
    ['the Capacitor config', { 'capacitor.config.ts': 'export default { a: 1 }' }],
  ])('changes with %s', (_, change) => {
    expect(nativeFingerprint(app({ ...base, ...change }))).not.toBe(nativeFingerprint(app(base)));
  });

  it('counts packages the plugin lists name, in any scope', () => {
    const lock = npmLock({ '@capacitor/core': '8.5.2', 'some-plugin': '1.0.0' });
    const listed = { ...base, 'ios/App/CapApp-SPM/Package.swift': '.package(path: "../../../node_modules/some-plugin")' };
    const a = app({ ...listed, 'package-lock.json': lock });
    const b = app({ ...listed, 'package-lock.json': lock.replace('1.0.0', '1.0.1') });
    expect(nativeFingerprint(a)).not.toBe(nativeFingerprint(b));
  });

  it('hashes paths with / on every OS', () => {
    const root = app(base);
    const hash = createHash('sha256');
    hash.update(JSON.stringify([['@capacitor/core', '8.5.2']]));
    for (const file of ['capacitor.config.ts', 'ios/App/App/AppDelegate.swift']) {
      hash.update(`\0${file}\0`);
      hash.update(fs.readFileSync(path.join(root, file)));
    }
    expect(nativeFingerprint(root)).toBe(hash.digest('hex').slice(0, 12));
  });

  it('hashes CRLF text like LF, and binary files as they are', () => {
    const lf = { 'capacitor.config.ts': 'export default {\n}\n', 'ios/App/App/A.plist': 'bplist00\0\r\n' };
    const crlf = { ...lf, 'capacitor.config.ts': 'export default {\r\n}\r\n' };
    expect(nativeFingerprint(app({ ...base, ...crlf }))).toBe(nativeFingerprint(app({ ...base, ...lf })));
    const binaryLf = { ...lf, 'ios/App/App/A.plist': 'bplist00\0\n' };
    expect(nativeFingerprint(app({ ...base, ...binaryLf }))).not.toBe(nativeFingerprint(app({ ...base, ...lf })));
  });

  it('ignores the web bundle cap sync copies into the native app', () => {
    expect(nativeFingerprint(app({ ...base, 'ios/App/App/public/x.plist': 'p' }))).toBe(nativeFingerprint(app(base)));
  });

  it('reads a workspace pnpm lockfile and extra config files', () => {
    const lock = (v) => `packages:\n\n  '@capacitor/core@${v}':\n    resolution: {}\n`;
    const files = (v, shell) => ({
      'pnpm-lock.yaml': lock(v),
      'client/capacitor.config.ts': 'export default {}',
      'client/src/shell.ts': shell,
    });
    const opts = { lockfile: '../pnpm-lock.yaml', configFiles: ['capacitor.config.ts', 'src/shell.ts'] };
    const fp = (v, shell) => nativeFingerprint(path.join(app(files(v, shell)), 'client'), opts);
    expect(fp('8.5.2', 'a')).toBe(fp('8.5.2', 'a'));
    expect(fp('8.5.2', 'a')).not.toBe(fp('8.6.0', 'a'));
    expect(fp('8.5.2', 'a')).not.toBe(fp('8.5.2', 'b'));
  });
});

describe('cspAllows', () => {
  const url = 'https://raw.githubusercontent.com/o/r/main/manifest.json';
  const page = (csp) => `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  it.each([
    ['no policy', '<html></html>', true],
    ['the host', page("connect-src 'self' https://raw.githubusercontent.com"), true],
    ['a path prefix', page('connect-src raw.githubusercontent.com/o/r/'), true],
    ['default-src', page('default-src https:'), true],
    ['another host', page('connect-src https://example.com'), false],
    ['another path', page('connect-src https://raw.githubusercontent.com/o/other/'), false],
    ['connect-src over default-src', page('default-src *; connect-src self'), false],
  ])('%s', (_, html, allowed) => {
    expect(cspAllows(html, url)).toBe(allowed);
  });
});

describe('checkMonotonic', () => {
  const entry = (rev, checksum = 'c') => ({ rev, version: `1.0.0-r${rev}`, commit: 'x', url: 'u', checksum, sessionKey: 's' });

  it('accepts a newer rev, and reports one already listed', () => {
    expect(checkMonotonic({ bundles: { fp: entry(1) } }, 'fp', entry(2))).toBe(false);
    expect(checkMonotonic({ bundles: { fp: entry(2) } }, 'fp', entry(2))).toBe(true);
  });

  it('refuses a rev that is not newer', () => {
    expect(() => checkMonotonic({ bundles: { fp: entry(2) } }, 'fp', entry(2, 'other'))).toThrow(PublishError);
    expect(() => checkMonotonic({ bundles: { fp: entry(3) } }, 'fp', entry(2))).toThrow(PublishError);
  });
});
