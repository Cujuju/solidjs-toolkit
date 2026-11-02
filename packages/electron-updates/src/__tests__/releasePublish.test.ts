import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { manifestName, type UpdateManifest, type UpdatePlatform } from '../manifest';
import { keygen, nightly, promote, type ReleaseConfig } from '../node/release';
import { verifyListing } from '../signing';
import { indexName, parseIndex } from '../updateIndex';
import { CONTEXT } from './fixtures';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const platforms: UpdatePlatform[] = ['win32', 'darwin', 'linux'];
const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals(); vi.resetAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(platform: UpdatePlatform, exists = true) {
  vi.stubGlobal('process', { ...process, platform });
  const dist = mkdtempSync(path.join(os.tmpdir(), 'eu-publish-'));
  dirs.push(dist);
  const c: ReleaseConfig = {
    appName: 'App', repo: 'me/app', signatureContext: CONTEXT, dist,
    publicKeyFile: path.join(dist, 'public.pem'), keyFile: path.join(dist, 'key', 'private.pem'),
    version: () => '1.2.3', archs: { [platform]: platform === 'darwin' ? ['arm64', 'x64'] : ['x64'] },
    updateSource: (p, arch) => p === 'darwin' ? `${arch}/App.app` : `App-${arch}${p === 'win32' ? '.exe' : '.AppImage'}`,
    extraFiles: () => ['first-install.zip'], tagSourceCommit: true,
  };
  keygen(c);
  const writeSources = (bytes: string) => {
    for (const arch of c.archs[platform]!) {
      const source = path.join(dist, c.updateSource(platform, arch, c.version()));
      if (platform === 'darwin') {
        mkdirSync(path.join(source, 'Contents'), { recursive: true });
        writeFileSync(path.join(source, 'Contents', 'Info.plist'), '<string>1.2.3</string>');
        writeFileSync(path.join(source, 'Contents', 'App'), bytes);
      } else writeFileSync(source, bytes);
    }
    writeFileSync(path.join(dist, 'first-install.zip'), bytes);
  };
  writeSources('initial build');
  const other = platform === 'darwin' ? 'linux' : 'darwin';
  const otherPack = other === 'darwin' ? `update-${other}-x64.pack` : c.updateSource(other, 'x64', c.version());
  const completed = new Map((exists ? [manifestName(other), indexName(other, 'x64'), otherPack] : [])
    .map((name) => [name, Buffer.from(`completed ${name}`)]));
  const state = { exists, isPrerelease: true, assets: new Map(completed), failName: '', writes: [] as string[][] };
  vi.mocked(execFileSync).mockImplementation(((exe: string, args: string[]) => {
    if (exe === 'git') return args[0] === 'status' ? '' : 'pushed';
    if (args[1] === 'view') {
      if (!state.exists) throw new Error('not found');
      return JSON.stringify({ isPrerelease: state.isPrerelease, assets: [...state.assets.keys()].map((name) => ({ name })) });
    }
    if (args[1] !== 'create' && args[1] !== 'upload') throw new Error(`Unexpected gh command: ${args}`);
    state.exists = true;
    const files = args.slice(3, args.indexOf('--repo'));
    state.writes.push(files.map((file) => path.basename(file)));
    for (const file of files) {
      const name = path.basename(file);
      if (state.failName === name) { state.failName = ''; throw new Error('upload failed'); }
      if (state.assets.has(name) && !args.includes('--clobber')) throw new Error(`asset already exists: ${name}`);
      if (name === manifestName(platform)) {
        const manifest = JSON.parse(readFileSync(file, 'utf8')) as UpdateManifest;
        for (const entry of manifest.files) {
          const indexBytes = state.assets.get(entry.name)!;
          expect(createHash('sha512').update(indexBytes).digest('base64')).toBe(entry.sha512);
          expect(verifyListing(readFileSync(c.publicKeyFile, 'utf8'), {
            context: CONTEXT, version: manifest.version, platform, file: entry, signature: entry.signature,
          })).toBeNull();
          const index = parseIndex(indexBytes);
          const pack = state.assets.get(index.pack)!;
          for (const chunk of index.chunks) {
            const bytes = pack.subarray(chunk.offset, chunk.offset + chunk.size);
            expect(createHash('sha256').update(chunk.compressed ? brotliDecompressSync(bytes) : bytes).digest('base64')).toBe(chunk.hash);
          }
        }
        expect(state.assets.has('first-install.zip')).toBe(true);
      }
      state.assets.set(name, readFileSync(file));
    }
    return '';
  }) as typeof execFileSync);
  return { c, state, completed, writeSources };
}

it.each(platforms)('publishes the %s completion marker only after its signed payloads and extras', async (platform) => {
  const { c, state, completed } = fixture(platform, false);
  await nightly(c, false);
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).not.toContain(manifestName(platform));
  expect(state.writes[1]).toEqual([manifestName(platform)]);
  for (const [name, bytes] of completed) expect(state.assets.get(name)).toEqual(bytes);
});

it.each(platforms.flatMap((platform) => ['pack', 'extra', 'manifest'].flatMap((failure) => [false, true].map((exists) => ({ platform, failure, exists })))))(
  'retries unfinished $platform uploads after a failed $failure (existing: $exists) without changing completed platforms', async ({ platform, failure, exists }) => {
    const { c, state, completed, writeSources } = fixture(platform, exists);
    state.failName = failure === 'manifest' ? manifestName(platform) : failure === 'extra' ? 'first-install.zip'
      : platform === 'darwin' ? `update-${platform}-arm64.pack` : c.updateSource(platform, 'x64', c.version());
    await expect(nightly(c, false)).rejects.toThrow('upload failed');
    expect(state.assets.has(manifestName(platform))).toBe(false);
    expect(() => promote(c, c.version(), false)).toThrow('has no update');
    state.writes = [];
    writeSources('rebuilt with a different build date');
    await nightly(c, false);
    expect(state.writes).toHaveLength(2);
    expect(state.writes[1]).toEqual([manifestName(platform)]);
    expect(state.assets.has(manifestName(platform))).toBe(true);
    for (const [name, bytes] of completed) expect(state.assets.get(name)).toEqual(bytes);
  },
);

it.each(platforms)('never replaces assets referenced by a completed %s manifest', async (platform) => {
  const { c, state, writeSources } = fixture(platform);
  await nightly(c, false);
  const published = new Map(state.assets);
  state.writes = [];
  writeSources('rebuilt with a different build date');
  await expect(nightly(c, false)).rejects.toThrow('already has');
  expect(state.writes).toEqual([]);
  expect(state.assets).toEqual(published);
});

it('never repairs unfinished assets on a stable release', async () => {
  const { c, state } = fixture('linux');
  state.isPrerelease = false;
  await expect(nightly(c, false)).rejects.toThrow('already stable');
  expect(state.writes).toEqual([]);
});
