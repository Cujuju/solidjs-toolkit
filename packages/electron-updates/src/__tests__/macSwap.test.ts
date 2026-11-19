/**
 * Runs the real macOS swap: apply()'s detached /bin/sh script, `mv` and LaunchServices `open`, on disposable bundles.
 * The packaged smoke (stage → quit → swap → relaunch) needs a real Electron.app: set ELECTRON_UPDATES_ELECTRON_APP.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { apply, swapScript, type StagedUpdate } from '../install.js';
import { manifestName } from '../manifest.js';
import { buildIndex } from '../node/pack.js';
import { buildManifest } from '../node/release.js';
import { CONTEXT, PRIVATE_PEM, PUBLIC_PEM } from './fixtures.js';

const onMac = process.platform === 'darwin';
const SKIP_REASON = 'the bundle swap and LaunchServices relaunch exist only on macOS';
/** The relaunched app writes its marker within a few seconds; LaunchServices can be slow on a busy CI runner. */
const MARKER_TIMEOUT_MS = 30_000;
/** Stage → quit → swap → relaunch of a real Electron bundle (two ~250 MB copies, one re-chunked as the seed). */
const SMOKE_TIMEOUT_MS = 180_000;
const dirs: string[] = [];
const tempDir = (prefix: string): string => {
  // realpath: /var → /private/var, so paths compare with what the relaunched process reports.
  const dir = execFileSync('realpath', [mkdtempSync(path.join(os.tmpdir(), prefix))], { encoding: 'utf8' }).trim();
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    spawnSync('chmod', ['-R', 'u+w', dir]);
    rmSync(dir, { recursive: true, force: true });
  }
});

const plist = (id: string, executable: string, version: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleExecutable</key><string>${executable}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSBackgroundOnly</key><true/>
</dict></plist>
`;

/** A minimal app bundle whose executable records its version and bundle path in `marker`, then exits. */
function shellBundle(at: string, version: string, id: string, marker: string): string {
  const bundle = path.join(at, 'App.app');
  mkdirSync(path.join(bundle, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(path.join(bundle, 'Contents', 'Info.plist'), plist(id, 'App', version));
  const exe = path.join(bundle, 'Contents', 'MacOS', 'App');
  writeFileSync(exe, `#!/bin/sh\necho "${version} $(cd "$(dirname "$0")/../.." && pwd -P)" >> '${marker}'\n`);
  chmodSync(exe, 0o755);
  return bundle;
}

async function stagedBundle(bundle: string): Promise<StagedUpdate['entries']> {
  return (await buildIndex(bundle, 'darwin', process.arch, tempDir('eu-index-'))).entries;
}

async function waitFor(file: string, done: (text: string) => boolean, timeoutMs = MARKER_TIMEOUT_MS): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (done(text)) return text;
    await new Promise((r) => setTimeout(r, 200));
  }
  const trace = existsSync(`${file}.trace`) ? `\nupdater status trace:\n${readFileSync(`${file}.trace`, 'utf8').split('\n').slice(-5).join('\n')}` : '';
  throw new Error(`timed out waiting for ${file}: ${existsSync(file) ? readFileSync(file, 'utf8') : '(missing)'}${trace}`);
}

/** A process that stands in for the quitting app: the swap waits for it to exit. */
function fakeApp(): { pid: number; quit: () => void } {
  const child = spawn('/bin/sleep', ['60'], { stdio: 'ignore' });
  return { pid: child.pid!, quit: () => child.kill() };
}

/** Runs one script as apply() does, but waits for it, to read its exit status. */
const runScript = (script: string) => spawnSync('/bin/sh', ['-c', script], { encoding: 'utf8' });
const versionOf = (bundle: string): string | undefined => /CFBundleVersion<\/key>\s*<string>([^<]+)/.exec(readFileSync(path.join(bundle, 'Contents', 'Info.plist'), 'utf8'))?.[1];

describe.skipIf(!onMac)(`macOS bundle swap, executed (skipped elsewhere: ${SKIP_REASON})`, () => {
  it('waits for the app to quit, replaces the bundle with the staged one and relaunches the new bundle', async () => {
    const root = tempDir('eu-swap-');
    const id = `test.electron-updates.${randomUUID()}`;
    const marker = path.join(root, 'launches.log');
    const target = shellBundle(path.join(root, 'Applications'), '1.0.0', id, marker);
    const staged = shellBundle(path.join(root, 'staged'), '1.0.1', id, marker);
    const app = fakeApp();
    const failures: Error[] = [];
    apply({ path: staged, entries: await stagedBundle(staged), version: '1.0.1', target: { kind: 'swap', platform: 'darwin', path: target } },
      true, app.pid, (err) => failures.push(err));
    await new Promise((r) => setTimeout(r, 600));
    // Nothing moves while the app is still running.
    expect(versionOf(target)).toBe('1.0.0');
    app.quit();
    const launches = await waitFor(marker, (text) => text.length > 0);
    expect(launches.trim()).toBe(`1.0.1 ${target}`);
    expect(versionOf(target)).toBe('1.0.1');
    expect(existsSync(staged)).toBe(false);
    expect(existsSync(`${target}.old`)).toBe(false);
    expect(failures).toEqual([]);
  });

  it('restores the original bundle intact when the staged one cannot be moved in, and relaunches it', async () => {
    const root = tempDir('eu-swap-');
    const id = `test.electron-updates.${randomUUID()}`;
    const marker = path.join(root, 'launches.log');
    const target = shellBundle(path.join(root, 'Applications'), '1.0.0', id, marker);
    const before = execFileSync('find', [target, '-type', 'f', '-exec', 'shasum', '{}', '+'], { encoding: 'utf8' });
    // The staged bundle vanished after verification (cleaned temp folder): the second mv fails mid-swap.
    const result = runScript(swapScript(process.pid + 1_000_000, target, path.join(root, 'staged', 'App.app'), `open '${target}'`));
    expect(result.stderr).toMatch(/No such file or directory/);
    expect(execFileSync('find', [target, '-type', 'f', '-exec', 'shasum', '{}', '+'], { encoding: 'utf8' })).toBe(before);
    expect(existsSync(`${target}.old`)).toBe(false);
    expect((await waitFor(marker, (text) => text.length > 0)).trim()).toBe(`1.0.0 ${target}`);
  });

  it('leaves the app untouched and does not relaunch when the old bundle cannot be set aside', async () => {
    const root = tempDir('eu-swap-');
    const marker = path.join(root, 'launches.log');
    const apps = path.join(root, 'Applications');
    const target = shellBundle(apps, '1.0.0', `test.electron-updates.${randomUUID()}`, marker);
    const staged = shellBundle(path.join(root, 'staged'), '1.0.1', 'unused', marker);
    chmodSync(apps, 0o555);
    const result = runScript(swapScript(process.pid + 1_000_000, target, staged, `open '${target}'`));
    chmodSync(apps, 0o755);
    expect(result.status).toBe(1);
    expect(versionOf(target)).toBe('1.0.0');
    expect(existsSync(staged)).toBe(true);
    await new Promise((r) => setTimeout(r, 1_500));
    expect(existsSync(marker)).toBe(false);
  });

  it('refuses to start the swap when the staged bundle changed after verification', async () => {
    const root = tempDir('eu-swap-');
    const marker = path.join(root, 'launches.log');
    const target = shellBundle(path.join(root, 'Applications'), '1.0.0', `test.electron-updates.${randomUUID()}`, marker);
    const staged = shellBundle(path.join(root, 'staged'), '1.0.1', 'unused', marker);
    const entries = await stagedBundle(staged);
    writeFileSync(path.join(staged, 'Contents', 'MacOS', 'App'), '#!/bin/sh\necho tampered\n');
    const failures: Error[] = [];
    apply({ path: staged, entries, version: '1.0.1', target: { kind: 'swap', platform: 'darwin', path: target } }, true, process.pid, (err) => failures.push(err));
    expect(failures.map((e) => e.message)).toEqual([expect.stringMatching(/no longer matches the signed index: App\.app\/Contents\/MacOS\/App/)]);
    expect(versionOf(target)).toBe('1.0.0');
  });
});

const electronApp = process.env.ELECTRON_UPDATES_ELECTRON_APP;
const distModule = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const smokeSkip = !onMac ? SKIP_REASON
  : !electronApp ? 'set ELECTRON_UPDATES_ELECTRON_APP to an Electron.app to run it'
    : !existsSync(distModule) ? 'build the package first (pnpm build): the fixture app loads dist/'
      : null;

/** The fixture app: v`from` finds, downloads and stages the update from `feed`, then quits into it; any version records itself. */
const SMOKE_MAIN = `
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./smoke.json');
const note = (line) => fs.appendFileSync(cfg.marker, line + '\\n');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  note(app.getVersion() + ' ' + process.execPath);
  if (app.getVersion() !== cfg.from) return app.exit(0);
  try {
    const { createUpdater } = await import(cfg.module);
    const fetch = async (url, init) => {
      if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify(cfg.releases));
      if (url === cfg.manifestName) return new Response(JSON.stringify(cfg.manifest));
      const data = fs.readFileSync(path.join(cfg.feed, url));
      const range = init && init.headers && init.headers.Range;
      if (!range) return new Response(data);
      const [start, end] = range.slice(6).split('-').map(Number);
      return new Response(data.subarray(start, end + 1), { status: 206, headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + data.length } });
    };
    const updater = createUpdater({ app, appName: 'App', repo: 'test/app', publicKey: cfg.publicKey, signatureContext: cfg.context,
      channel: () => 'nightly', dir: cfg.updates, fetch });
    updater.on('status', (s) => {
      if (s.state === 'error') note('error ' + s.message);
      else fs.appendFileSync(cfg.marker + '.trace', JSON.stringify(s) + '\\n');
    });
    await updater.check();
    await updater.download();
    if (updater.status().state !== 'ready') { note('not staged ' + JSON.stringify(updater.status())); return app.exit(1); }
    note('staged');
    updater.quitAndInstall();
  } catch (err) { note('error ' + err.stack); app.exit(1); }
});
`;

/** A copy of Electron.app as App.app at `version`, running SMOKE_MAIN, ad-hoc signed again after the edits. */
function electronBundle(at: string, version: string, id: string, config: object): string {
  const bundle = path.join(at, 'App.app');
  mkdirSync(at, { recursive: true });
  execFileSync('ditto', [electronApp!, bundle]);
  // Renamed as electron-builder does: Electron treats an executable named Electron as unpackaged (no updates).
  const setPlist = (info: string, values: Record<string, string>): void => {
    for (const [key, value] of Object.entries(values)) execFileSync('plutil', ['-replace', key, '-string', value, info]);
    execFileSync('plutil', ['-convert', 'xml1', info]);
  };
  const contents = path.join(bundle, 'Contents');
  renameSync(path.join(contents, 'MacOS', 'Electron'), path.join(contents, 'MacOS', 'App'));
  setPlist(path.join(contents, 'Info.plist'), { CFBundleIdentifier: id, CFBundleShortVersionString: version, CFBundleVersion: version, CFBundleName: 'App', CFBundleExecutable: 'App' });
  const frameworks = path.join(contents, 'Frameworks');
  for (const helper of readdirSync(frameworks).filter((name) => name.startsWith('Electron Helper'))) {
    const name = helper.replace('Electron', 'App').replace(/\.app$/, '');
    renameSync(path.join(frameworks, helper), path.join(frameworks, `${name}.app`));
    const helperContents = path.join(frameworks, `${name}.app`, 'Contents');
    renameSync(path.join(helperContents, 'MacOS', helper.replace(/\.app$/, '')), path.join(helperContents, 'MacOS', name));
    setPlist(path.join(helperContents, 'Info.plist'), { CFBundleExecutable: name, CFBundleName: name, CFBundleIdentifier: `${id}.${name.replace(/\W+/g, '')}` });
  }
  const appDir = path.join(bundle, 'Contents', 'Resources', 'app');
  mkdirSync(appDir);
  writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'app', productName: 'App', version, main: 'main.js' }));
  writeFileSync(path.join(appDir, 'main.js'), SMOKE_MAIN);
  // The app loads its own copy: under LaunchServices, macOS asks before an app reads ~/Documents or ~/Desktop.
  cpSync(path.dirname(distModule), path.join(appDir, 'updater'), { recursive: true });
  writeFileSync(path.join(appDir, 'smoke.json'), JSON.stringify({ ...config, module: pathToFileURL(path.join(appDir, 'updater', 'index.js')).href }));
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle]);
  return bundle;
}

describe.skipIf(smokeSkip !== null)(`packaged update smoke (skipped: ${smokeSkip ?? 'no'})`, () => {
  it('stages a signed update, quits, swaps the bundle and relaunches the new version', async () => {
    const root = tempDir('eu-smoke-');
    const id = `test.electron-updates.smoke.${randomUUID()}`;
    const feed = path.join(root, 'feed');
    const keys = path.join(root, 'keys');
    mkdirSync(keys);
    writeFileSync(path.join(keys, 'update.pem'), PRIVATE_PEM, { mode: 0o600 });
    writeFileSync(path.join(keys, 'update.pub.pem'), PUBLIC_PEM);
    const shared = { marker: path.join(root, 'launches.log'), from: '1.0.0', updates: path.join(root, 'updates'), feed, publicKey: PUBLIC_PEM, context: CONTEXT };
    // The release: the new bundle, chunked and signed by the package's own release code.
    electronBundle(path.join(feed, 'release'), '1.0.1', id, shared);
    const manifest = await buildManifest({
      appName: 'App', repo: 'test/app', signatureContext: CONTEXT, dist: feed, publicKeyFile: path.join(keys, 'update.pub.pem'),
      keyFile: path.join(keys, 'update.pem'), version: () => '1.0.1', archs: { darwin: [process.arch] }, updateSource: () => 'release/App.app',
    }, 'darwin', '1.0.1');
    const assets = [manifestName('darwin'), ...manifest.files.map((f) => f.name), `update-darwin-${process.arch}.pack`].map((name) => ({ name, browser_download_url: name }));
    const installed = electronBundle(path.join(root, 'Applications'), '1.0.0', id, {
      ...shared, manifest, manifestName: manifestName('darwin'), releases: [{ tag_name: 'v1.0.1', draft: false, prerelease: true, assets }],
    });
    // Launched as a user would; the swap then relaunches through LaunchServices.
    execFileSync('open', [installed]);
    const exe = path.join(installed, 'Contents', 'MacOS', 'App');
    // Downloading re-chunks the installed bundle as the seed, so allow minutes, not seconds.
    const launches = await waitFor(shared.marker, (text) => /^1\.0\.1 /m.test(text) || /^(error|not staged)/m.test(text), SMOKE_TIMEOUT_MS);
    expect(launches.split('\n').filter(Boolean)).toEqual([`1.0.0 ${exe}`, 'staged', `1.0.1 ${exe}`]);
    expect(versionOf(installed)).toBe('1.0.1');
    expect(existsSync(`${installed}.old`)).toBe(false);
    expect(readFileSync(path.join(installed, 'Contents', 'Resources', 'app', 'package.json'), 'utf8')).toContain('"version":"1.0.1"');
  }, 240_000);
});
