/**
 * What a build is, for live updates:
 *
 *   rev                 a commit count: grows with every commit, so a newer bundle is a bigger number
 *   native fingerprint  a hash of everything a web bundle needs from the native app around it (the
 *                       Capacitor plugins and their versions, the Capacitor config, the app's own native
 *                       code and plists). A live update only goes to apps whose native part matches.
 *
 * The native app carries both in its Capacitor Updater `version` ("3.0.0-r612-1a2b3c4d5e6f", see
 * nativeVersion); each web bundle carries its own, baked in by the app's build.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Packages under these scopes ship native code; their CLI and asset tools don't. */
const NATIVE_PACKAGE = /^@(capacitor|capgo)\//;
const NOT_NATIVE = new Set(['@capacitor/cli', '@capacitor/assets', '@capgo/cli']);
/** The native plugin lists `cap sync` writes, naming every package with native code (any scope). */
export const DEFAULT_PLUGIN_LISTS = ['ios/App/CapApp-SPM/Package.swift', 'android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle'];
/** The app's own native code and configuration. Not the Xcode project or build.gradle: they carry the
 * build number, which every store build bumps. */
export const DEFAULT_NATIVE_DIRS = [
  ['ios/App/App', /\.(swift|m|h|plist|entitlements|storyboard|xib)$/],
  ['android/app/src/main', /(\.(java|kt)|^AndroidManifest\.xml)$/],
];

function gitRev(root, ref) {
  try {
    const out = execFileSync('git', ['-C', root, 'rev-list', '--count', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return Number(out.trim()) || null;
  } catch {
    return null;
  }
}

/** `envVar`'s value if set, else the sum of the roots' commit counts at `ref`; null if any can't be counted. */
export function buildRev({ roots, ref = 'HEAD', envVar } = {}) {
  if (envVar && process.env[envVar]) return Number(process.env[envVar]);
  let sum = 0;
  for (const root of roots) {
    const count = gitRev(root, ref);
    if (!count) return null;
    sum += count;
  }
  return sum;
}

/** [name, version] of each entry in a pnpm lockfile's `packages:` sections (lockfile v6 and later). */
export function pnpmPackages(text) {
  const out = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inPackages = line.trimEnd() === 'packages:';
      continue;
    }
    const m = inPackages && /^ {2}'?\/?((?:@[^/@\s']+\/)?[^@\s']+)@([^('\s:]+)/.exec(line);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

/** [name, version] of each installed package in an npm or pnpm lockfile. */
function lockedPackages(file) {
  const text = fs.readFileSync(file, 'utf8');
  const name = path.basename(file);
  if (name === 'pnpm-lock.yaml') return pnpmPackages(text);
  if (name === 'package-lock.json') {
    return Object.entries(JSON.parse(text).packages ?? {}).map(([key, info]) => [key.replace(/^.*node_modules\//, ''), info.version]);
  }
  throw new Error(`unsupported lockfile ${file} (package-lock.json or pnpm-lock.yaml)`);
}

/** A file's bytes; text with CRLF as LF, so a Windows checkout (core.autocrlf) hashes like macOS. Binary (has NUL) as is. */
function normalizedBytes(file) {
  const bytes = fs.readFileSync(file);
  return bytes.includes(0) ? bytes : Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
}

function filesUnder(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    // public/: the web bundle `cap sync` copies in, not native code.
    .filter((e) => e.isFile() && pattern.test(e.name) && !e.parentPath.includes(`${path.sep}public`))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

/** 12 hex digits identifying the native app a web bundle built from `appRoot` needs. Paths are relative to `appRoot`. */
export function nativeFingerprint(
  appRoot,
  { lockfile = 'package-lock.json', pluginLists = DEFAULT_PLUGIN_LISTS, nativeDirs = DEFAULT_NATIVE_DIRS, configFiles = ['capacitor.config.ts'] } = {},
) {
  const hash = createHash('sha256');
  const listed = new Set();
  for (const file of pluginLists) {
    const full = path.join(appRoot, file);
    const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
    for (const m of text.matchAll(/node_modules\/((?:@[^/'"]+\/)?[^/'"]+)/g)) listed.add(m[1]);
  }
  const plugins = lockedPackages(path.join(appRoot, lockfile))
    .filter(([name]) => listed.has(name) || (NATIVE_PACKAGE.test(name) && !NOT_NATIVE.has(name)))
    .sort(([a], [b]) => a.localeCompare(b));
  hash.update(JSON.stringify(plugins));
  // The plugin lists themselves aren't hashed: they hold paths, which depend on where cap sync ran.
  const files = [...configFiles.map((f) => path.join(appRoot, f)), ...nativeDirs.flatMap(([dir, re]) => filesUnder(path.join(appRoot, dir), re))];
  for (const file of files) {
    // '/' on every OS, so Windows and macOS agree.
    hash.update(`\0${path.relative(appRoot, file).split(path.sep).join('/')}\0`);
    hash.update(normalizedBytes(file));
  }
  return hash.digest('hex').slice(0, 12);
}

/** The native app's Capacitor Updater version: "<marketing version>-r<rev>-<fingerprint>". */
export function nativeVersion(appVersion, rev, fingerprint) {
  return `${appVersion}-r${rev}-${fingerprint}`;
}
