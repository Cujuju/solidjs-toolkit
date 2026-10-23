/**
 * Publish a live update: build a web bundle, sign it, release it on a public GitHub repo, and list it in
 * that repo's manifest.json under the native fingerprint it was built for, where installed apps look.
 * Needs `gh` signed in with push access to the repo. Each release also carries entry.json, its manifest
 * entry: if a publish stops between releasing and listing, publishing the same source again finishes it.
 */
import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cspAllows } from './csp.mjs';
import { buildRev, nativeFingerprint, normalizedBytes } from './fingerprint.mjs';

/** Capgo's CLI, pinned: its zip and encryption must match what the plugin accepts. */
export const CAPGO_CLI = '@capgo/cli@8.83.1';
/** Manifest writes retried when another publish changed it meanwhile. */
const MANIFEST_WRITE_ATTEMPTS = 4;

/** A publish that stopped for a reason worth showing as is. */
export class PublishError extends Error {}

const fail = (msg) => {
  throw new PublishError(msg);
};
/** Windows runs these (.cmd shims) only through cmd.exe. */
const WINDOWS_SHIMS = new Set(['npm', 'npx', 'pnpm']);
/** Arguments cmd.exe passes through unchanged when quoted: no quotes, no %VAR% expansion. */
const CMD_SAFE = /^[^"%]*$/;

/** One cmd.exe argument. */
export function cmdArg(arg) {
  if (!CMD_SAFE.test(arg)) fail(`can't pass ${JSON.stringify(arg)} through cmd.exe (it has " or %)`);
  // Trailing backslashes doubled, else the last one escapes the closing quote.
  return /^[\w\-.,:\\/@=+]+$/.test(arg) ? arg : `"${arg.replace(/(\\+)$/, '$1$1')}"`;
}

function run(cmd, args, opts = {}) {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts };
  if (process.platform === 'win32' && WINDOWS_SHIMS.has(cmd)) return execSync([cmd, ...args].map(cmdArg).join(' '), options);
  return execFileSync(cmd, args, options);
}
const step = (msg) => console.log(`\n▸ ${msg}`);
const errText = (e) => String(e.stderr ?? e.message).trim();

/** The raw URL apps fetch the manifest from. */
export const manifestUrl = (repo) => `https://raw.githubusercontent.com/${repo}/main/manifest.json`;

/** Capgo's CLI, whose --json result is the last JSON object it prints. */
function capgo(cli, cwd, args) {
  const out = run('npx', ['--yes', cli, ...args, '--json'], { cwd });
  return JSON.parse(out.slice(out.lastIndexOf('\n{') + 1));
}

/**
 * Fails unless an app holding `publicKey` accepts `signedChecksum`. Capgo's updater 8.x decrypts it, as hex,
 * to the SHA-256 of the decrypted zip; another format is rejected only on the device.
 */
export function checkSignedChecksum(signedChecksum, zipChecksum, publicKey) {
  let decrypted = null;
  try {
    const signed = /^[0-9a-f]+$/i.test(signedChecksum) ? Buffer.from(signedChecksum, 'hex') : null;
    if (signed) decrypted = crypto.publicDecrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, signed).toString('hex');
  } catch {
    decrypted = null;
  }
  if (decrypted !== zipChecksum.toLowerCase()) {
    fail(`the signed checksum doesn't decrypt to the zip's SHA-256 with the app's publicKey; apps would reject this bundle`);
  }
}

/** The manifest and its blob sha, or an empty one if the repo has none yet. */
function readManifest(repo) {
  try {
    const file = JSON.parse(run('gh', ['api', `repos/${repo}/contents/manifest.json`], { stdio: ['ignore', 'pipe', 'pipe'] }));
    return { manifest: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')), sha: file.sha };
  } catch (e) {
    if (/Not Found|HTTP 404/.test(String(e.stderr ?? ''))) return { manifest: { bundles: {} }, sha: undefined };
    fail(`can't read ${repo}'s manifest: ${errText(e)}`);
  }
}

/** Fails unless `entry` may be listed for `fingerprint`; true if it already is. */
export function checkMonotonic(manifest, fingerprint, entry, repo = 'the manifest') {
  const previous = manifest.bundles?.[fingerprint];
  if (previous?.version === entry.version && previous.checksum === entry.checksum) return true;
  if (previous && previous.rev >= entry.rev) fail(`${repo} already has r${previous.rev} for native ${fingerprint}`);
  return false;
}

/** Lists `entry` in the manifest, rereading it if someone else changed it meanwhile. */
function listInManifest(repo, fingerprint, entry) {
  for (let attempt = 1; ; attempt++) {
    const { manifest, sha } = readManifest(repo);
    if (checkMonotonic(manifest, fingerprint, entry, repo)) return;
    manifest.bundles = { ...manifest.bundles, [fingerprint]: entry };
    const body = JSON.stringify({
      message: `${entry.version} for native ${fingerprint}`,
      content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`).toString('base64'),
      ...(sha ? { sha } : {}),
    });
    try {
      run('gh', ['api', '-X', 'PUT', `repos/${repo}/contents/manifest.json`, '--input', '-'], { input: body, stdio: ['pipe', 'ignore', 'pipe'] });
      return;
    } catch (e) {
      if (attempt >= MANIFEST_WRITE_ATTEMPTS) fail(`can't update the manifest: ${errText(e)}`);
      console.log('  the manifest changed meanwhile: rereading it');
    }
  }
}

/** Fails unless `distDir` is a bundle that may be published and will keep checking `url` for updates. */
function checkDist(distDir, entryHtml, url) {
  const files = fs.readdirSync(distDir, { recursive: true });
  const maps = files.filter((f) => f.endsWith('.map'));
  if (maps.length) fail(`${distDir} has source maps (${maps.join(', ')}); they would publish the source`);
  const html = path.join(distDir, entryHtml);
  // Capgo's plugin loads index.html from the bundle's root.
  if (!fs.existsSync(html)) fail(`${distDir} has no ${entryHtml}`);
  // A bundle that can't reach the manifest would never update again.
  if (!cspAllows(fs.readFileSync(html, 'utf8'), url)) fail(`${entryHtml}'s Content-Security-Policy doesn't let the app fetch ${url} (connect-src)`);
  const fetchesManifest = files.filter((f) => f.endsWith('.js')).some((f) => fs.readFileSync(path.join(distDir, f), 'utf8').includes(url));
  if (!fetchesManifest) fail(`the bundle never fetches ${url}`);
}

/** The release already made for `tag` by an earlier run, if any. */
function releasedEntry(repo, tag, work) {
  try {
    run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
  const file = path.join(work, 'entry.json');
  try {
    run('gh', ['release', 'download', tag, '--repo', repo, '--pattern', 'entry.json', '--output', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    fail(`${repo}@${tag} exists without entry.json; delete that release and publish again`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Publishes `source`, built by `build(workDir)` into `{ appDir, distDir, fingerprint }`. `appDir` (where
 * the Capacitor config is) is only read. Returns the manifest entry, or null for a dry run.
 */
export async function publishLiveUpdate({ appId, title, assetPrefix, repo, keyPath, source, build, entryHtml = 'index.html', capgoCli = CAPGO_CLI, dryRun = false }) {
  if (!fs.existsSync(keyPath)) fail(`no signing key at ${keyPath}`);
  const { rev, version, commit, subject } = source;
  const tag = `r${rev}`;
  const url = manifestUrl(repo);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `${assetPrefix}-ota-`));

  const released = releasedEntry(repo, tag, work);
  if (released) {
    step(`${repo}@${tag} is already released: listing it`);
    const { fingerprint, ...entry } = released;
    if (entry.commit !== commit) fail(`${repo}@${tag} is ${entry.commit}, not ${commit}`);
    if (dryRun) {
      step(`dry run: would list ${tag} for native ${fingerprint}`);
      return null;
    }
    listInManifest(repo, fingerprint, entry);
    fs.rmSync(work, { recursive: true, force: true });
    console.log(`\n✓ ${version} is live for native ${fingerprint}.`);
    return entry;
  }

  const { appDir, distDir, fingerprint } = await build(work);
  checkDist(distDir, entryHtml, url);

  step('zipping and signing');
  // Capgo's CLI gets the app's Capacitor config as plain JSON, as Capacitor's own CLI resolves it.
  const stage = path.join(work, 'stage');
  fs.mkdirSync(stage);
  const capConfig = JSON.parse(run('npx', ['cap', 'config', '--json'], { cwd: appDir, stdio: ['ignore', 'pipe', 'ignore'] }));
  fs.writeFileSync(path.join(stage, 'capacitor.config.json'), JSON.stringify(capConfig.app.extConfig, null, 2));
  const zipped = capgo(capgoCli, stage, [
    'bundle', 'zip', appId,
    '--path', path.resolve(distDir),
    '--package-json', path.resolve(appDir, 'package.json'),
    '--bundle', version,
    '--name', `${tag}.zip`,
    '--key-v2',
  ]);
  // The app's package.json tells the CLI which updater reads the checksum; without it, it signs an older format.
  const signed = capgo(capgoCli, stage, [
    'bundle', 'encrypt', path.resolve(stage, zipped.filename), zipped.checksum,
    '--key', keyPath,
    '--package-json', path.resolve(appDir, 'package.json'),
  ]);
  const publicKey = capConfig.app.extConfig.plugins?.CapacitorUpdater?.publicKey;
  if (!publicKey) fail(`${appDir}'s Capacitor config has no CapacitorUpdater.publicKey`);
  checkSignedChecksum(signed.checksum, zipped.checksum, publicKey);  const asset = path.join(work, `${assetPrefix}-${tag}.zip`);
  fs.renameSync(path.resolve(stage, signed.filename), asset);

  const entry = {
    rev,
    version,
    commit,
    url: `https://github.com/${repo}/releases/download/${tag}/${path.basename(asset)}`,
    checksum: signed.checksum,
    sessionKey: signed.ivSessionKey,
  };
  const entryFile = path.join(work, 'entry.json');
  fs.writeFileSync(entryFile, `${JSON.stringify({ fingerprint, ...entry }, null, 2)}\n`);

  step(`reading ${repo}'s manifest`);
  const { manifest } = readManifest(repo);
  checkMonotonic(manifest, fingerprint, entry, repo);
  const known = Object.keys(manifest.bundles ?? {});
  if (known.length && !known.includes(fingerprint)) {
    console.log(`  ! native ${fingerprint} is new: only apps built from it (a store build) will get this update.`);
    console.log(`    Apps published before have ${known.join(', ')}.`);
  }

  if (dryRun) {
    step(`dry run: would release ${asset} as ${repo}@${tag} and list it as:`);
    console.log(JSON.stringify(entry, null, 2));
    console.log(`\n  (files kept in ${work})`);
    return null;
  }

  step(`releasing ${tag}`);
  run('gh', ['release', 'create', tag, asset, entryFile, '--repo', repo, '--title', `${title} ${version}`, '--notes', `${subject}\n\nNative ${fingerprint}.`], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  step('updating the manifest');
  listInManifest(repo, fingerprint, entry);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`\n✓ ${version} is live for native ${fingerprint}. Apps pick it up on their next launch or return.`);
  return entry;
}

/** One repo's commit at `ref` as a publish source: version "<package.json version>-r<rev>". */
export function gitSource(root, ref = 'HEAD') {
  let sha;
  try {
    sha = run('git', ['-C', root, 'rev-parse', '--verify', `${ref}^{commit}`], { stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    fail(`no commit ${ref} in ${root}: ${errText(e)}`);
  }
  const rev = buildRev({ roots: [root], ref: sha });
  if (!rev) fail(`can't count the commits up to ${ref}`);
  const pkg = JSON.parse(run('git', ['-C', root, 'show', `${sha}:package.json`]));
  const subject = run('git', ['-C', root, 'log', '-1', '--format=%s', sha]).trim();
  return { rev, version: `${pkg.version}-r${rev}`, commit: sha, subject };
}

/**
 * Builds `commit` from a clean snapshot (git archive) of `root`, with `root`'s node_modules, whose
 * lockfile must match the commit's. Only built files publish, never the source.
 */
export function snapshotBuild({ root, commit, command = ['npm', 'run', 'build'], env = {}, distDir = 'dist', lockfile = 'package-lock.json', fingerprint = (dir) => nativeFingerprint(dir, { lockfile }) }) {
  return async (work) => {
    step(`snapshot of ${commit.slice(0, 12)}`);
    const src = path.join(work, 'src');
    fs.mkdirSync(src);
    // Git writes the commit's files with a scratch index: no tar, and the checkout's own index and HEAD stay as they are.
    run('git', ['-C', root, `--work-tree=${src}`, 'checkout', commit, '--', '.'], { env: { ...process.env, GIT_INDEX_FILE: path.join(work, 'index') } });
    // Line endings aside: a Windows checkout writes CRLF.
    if (!normalizedBytes(path.join(src, lockfile)).equals(normalizedBytes(path.join(root, lockfile)))) {
      fail(`${commit.slice(0, 12)}'s ${lockfile} differs from the installed one; publish it from a checkout of it, after a clean install`);
    }
    // A junction on Windows: no admin rights or developer mode needed.
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(src, 'node_modules'), 'junction');
    const native = fingerprint(src);
    step(`building for native ${native}`);
    run(command[0], command.slice(1), { cwd: src, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...env } });
    return { appDir: src, distDir: path.join(src, distDir), fingerprint: native };
  };
}
