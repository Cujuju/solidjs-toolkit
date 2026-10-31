/**
 * Release tooling, run locally on each OS after packaging:
 *   keygen | nightly [--dry-run] | promote <version> [--dry-run]
 * `nightly` signs this OS's update files, writes its manifest and uploads both to the prerelease
 * v<version>, creating it if needed. `promote` makes a nightly the stable (latest) release.
 */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isUpdatePlatform, manifestName, type UpdateFile, type UpdateManifest, type UpdatePlatform } from '../manifest';
import { publicKeyOf, sha512File, signFile, verifyListing } from '../signing';
import { buildIndex } from './pack';
import { indexName, parseIndex } from '../updateIndex';
import { compareVersions, releaseTag } from '../version';

export interface ReleaseConfig {
  appName: string;
  /** `owner/name` of the public repo whose releases are the updates. */
  repo: string;
  /** Must match the app's updater option. */
  signatureContext: string;
  /** electron-builder's output folder. */
  dist: string;
  /** Committed; builds embed it. */
  publicKeyFile: string;
  /** Kept outside the repo. */
  keyFile: string;
  /** The version being released; must equal the packaged app's. */
  version: () => string;
  /** Architectures built per platform; a platform listed here must be published before promote. */
  archs: Partial<Record<UpdatePlatform, string[]>>;
  /** Target file or unpacked bundle, relative to dist. */
  updateSource: (platform: UpdatePlatform, arch: string, version: string) => string;
  /** Other files to upload when present: first-install images, blockmaps. */
  extraFiles?: (platform: UpdatePlatform, version: string) => string[];
  /** Tag the release at HEAD; true when the releases repo is the source repo. */
  tagSourceCommit?: boolean;
}

/** Owner-only: the private key must not be readable by other users. */
const PRIVATE_KEY_MODE = 0o600;

export class ReleaseError extends Error {}
const fail = (msg: string): never => {
  throw new ReleaseError(msg);
};

const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Git may check a committed key out with CRLF line endings. */
const samePem = (a: string, b: string): boolean => a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();

function readPublicKey(c: ReleaseConfig): string {
  return existsSync(c.publicKeyFile) ? readFileSync(c.publicKeyFile, 'utf8') : fail(`no ${c.publicKeyFile}; run keygen first`);
}

export function keygen(c: ReleaseConfig): void {
  if (existsSync(c.keyFile)) fail(`${c.keyFile} already exists; installed apps trust it, so it is never replaced here`);
  const { privateKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  mkdirSync(path.dirname(c.keyFile), { recursive: true });
  writeFileSync(c.keyFile, pem, { mode: PRIVATE_KEY_MODE, flag: 'wx' });
  writeFileSync(c.publicKeyFile, publicKeyOf(pem));
  console.log(`Private key: ${c.keyFile} (back it up somewhere safe, outside the repo)`);
  console.log(`Public key:  ${c.publicKeyFile} (commit it; builds embed it)`);
}

/** Signs this platform's update files and returns their manifest. */
export async function buildManifest(c: ReleaseConfig, platform: UpdatePlatform, version: string): Promise<UpdateManifest> {
  const archs = c.archs[platform] ?? fail(`the release config builds nothing for ${platform}`);
  if (!existsSync(c.keyFile)) fail(`no signing key at ${c.keyFile}; run keygen first`);
  const privatePem = readFileSync(c.keyFile, 'utf8');
  const publicPem = readPublicKey(c);
  if (!samePem(publicKeyOf(privatePem), publicPem)) fail(`${c.publicKeyFile} is not the public half of ${c.keyFile}`);
  const files: UpdateFile[] = [];
  for (const arch of archs) {
    const source = c.updateSource(platform, arch, version);
    const localSource = path.join(c.dist, source);
    if (!existsSync(localSource)) fail(`${localSource} is missing; package ${platform} ${arch} first`);
    const stat = statSync(localSource);
    const extension = { win32: '.exe', linux: '.AppImage', darwin: '.app' }[platform];
    if (!source.endsWith(extension) || (platform === 'darwin' ? !stat.isDirectory() : !stat.isFile())) fail(`${source}: ${platform} updates require ${extension}`);
    if (platform === 'darwin' && !readFileSync(path.join(localSource, 'Contents', 'Info.plist'), 'utf8').includes(`<string>${version}</string>`)) fail(`${source} is not version ${version}`);
    const index = await buildIndex(localSource, platform, arch, c.dist);
    if (/\s/.test(index.pack)) fail(`${index.pack}: GitHub renames assets with spaces; drop them from the artifact name`);
    const name = indexName(platform, arch);
    const local = path.join(c.dist, name);
    const unsigned = { arch, name, sha512: await sha512File(local), size: statSync(local).size };
    const fields = { context: c.signatureContext, version, platform, file: unsigned };
    const signature = signFile(privatePem, fields);
    // Checked with the committed public key: what is uploaded is what installed apps accept.
    if (verifyListing(publicPem, { ...fields, signature })) fail(`${name}: the signature does not verify`);
    files.push({ ...unsigned, signature });
  }
  return { version, platform, files };
}

const gh = (args: string[], dryRun: boolean): void => {
  console.log(`gh ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  if (!dryRun) execFileSync('gh', args, { stdio: 'inherit' });
};

interface ReleaseView {
  isPrerelease: boolean;
  assets: { name: string }[];
}

function viewRelease(repo: string, tag: string): ReleaseView | null {
  try {
    return JSON.parse(execFileSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'isPrerelease,assets'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as ReleaseView;
  } catch {
    return null;
  }
}

/** A nightly must name one pushed commit: no uncommitted tracked changes, HEAD on a remote branch. */
function assertPublishable(): void {
  if (git(['status', '--porcelain', '--untracked-files=no'])) fail('the checkout has uncommitted changes; commit them so the version names what was built');
  if (!git(['branch', '-r', '--contains', 'HEAD'])) fail('HEAD is not pushed; push it first');
}

export async function nightly(c: ReleaseConfig, dryRun: boolean): Promise<void> {
  const platform = process.platform;
  if (!isUpdatePlatform(platform)) fail(`no update path for ${platform}`);
  assertPublishable();
  const version = c.version();
  const manifest = await buildManifest(c, platform as UpdatePlatform, version);
  const manifestFile = path.join(c.dist, manifestName(manifest.platform));
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const extras = (c.extraFiles?.(manifest.platform, version) ?? []).map((f) => path.join(c.dist, f)).filter((f) => existsSync(f));
  const packs = manifest.files.map((f) => path.join(c.dist, parseIndex(readFileSync(path.join(c.dist, f.name))).pack));
  const assets = [...new Set([...manifest.files.map((f) => path.join(c.dist, f.name)), ...packs, ...extras, manifestFile])];
  if (assets.some((f) => /\s/.test(path.basename(f)))) fail('GitHub release asset names must have no whitespace');
  const tag = releaseTag(version);
  const existing = viewRelease(c.repo, tag);
  if (existing && !existing.isPrerelease) fail(`${tag} is already stable; nightlies never change a stable release`);
  if (existing?.assets.some((a) => a.name === manifestName(manifest.platform))) fail(`${tag} already has ${platform}'s update; commit and push to make a new version`);
  if (existing) return gh(['release', 'upload', tag, ...assets, '--repo', c.repo], dryRun);
  const target = c.tagSourceCommit ? ['--target', git(['rev-parse', 'HEAD'])] : [];
  const title = `${c.appName} ${version}`;
  gh(['release', 'create', tag, ...assets, '--repo', c.repo, '--prerelease', '--title', title, '--notes', `${title} nightly`, ...target], dryRun);
}

function latestStable(repo: string): string | null {
  try {
    const tag = execFileSync('gh', ['release', 'view', '--repo', repo, '--json', 'tagName', '--jq', '.tagName'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return tag.replace(/^v/, '');
  } catch {
    return null;
  }
}

export function promote(c: ReleaseConfig, version: string, dryRun: boolean): void {
  const tag = releaseTag(version);
  const release = viewRelease(c.repo, tag) ?? fail(`${tag} does not exist in ${c.repo}`);
  if (!release.isPrerelease) fail(`${tag} is already stable`);
  const missing = (Object.keys(c.archs) as UpdatePlatform[]).filter((p) => !release.assets.some((a) => a.name === manifestName(p)));
  if (missing.length) fail(`${tag} has no update for ${missing.join(', ')}; publish the nightly there first`);
  const stable = latestStable(c.repo);
  if (stable && compareVersions(version, stable) <= 0) fail(`${tag} is not newer than the stable ${stable}`);
  gh(['release', 'edit', tag, '--repo', c.repo, '--prerelease=false', '--latest', '--notes', `${c.appName} ${version}`], dryRun);
}

const USAGE = 'usage: keygen | nightly [--dry-run] | promote <version> [--dry-run]';

/** Runs one command from `argv`; prints release errors and exits 1 on them. */
export async function runReleaseCli(c: ReleaseConfig, argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  const dryRun = rest.includes('--dry-run');
  const arg = rest.find((a) => !a.startsWith('--'));
  try {
    if (command === 'keygen') keygen(c);
    else if (command === 'nightly') await nightly(c, dryRun);
    else if (command === 'promote') promote(c, arg ?? fail(USAGE), dryRun);
    else fail(USAGE);
  } catch (err) {
    if (!(err instanceof ReleaseError)) throw err;
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
