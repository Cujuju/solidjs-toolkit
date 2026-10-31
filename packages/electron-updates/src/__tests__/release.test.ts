import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest, keygen, type ReleaseConfig } from '../node/release';
import { parseIndex } from '../updateIndex';
import { brotliDecompressSync } from 'node:zlib';
import { verifyListing } from '../signing';
import { CONTEXT } from './fixtures';

function config(): ReleaseConfig {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'eu-rel-'));
  return {
    appName: 'App',
    repo: 'me/app-updates',
    signatureContext: CONTEXT,
    dist: dir,
    publicKeyFile: path.join(dir, 'public.pem'),
    keyFile: path.join(dir, 'key', 'private.pem'),
    version: () => '1.2.3',
    archs: { darwin: ['arm64', 'x64'] },
    updateSource: (_p, arch, v) => `${arch}/App.app`,
  };
}

describe('buildManifest', () => {
  it('signs every configured arch so the app verifies it', async () => {
    const c = config();
    keygen(c);
    bundle(c, 'arm64');
    bundle(c, 'x64');
    const m = await buildManifest(c, 'darwin', '1.2.3');
    expect(m.files.map((f) => f.name)).toEqual(['update-darwin-arm64.index', 'update-darwin-x64.index']);
    for (const file of m.files) {
      const index = parseIndex(readFileSync(path.join(c.dist, file.name)));
      const pack = readFileSync(path.join(c.dist, index.pack));
      const chunk = index.chunks[0]!;
      const bytes = pack.subarray(chunk.offset, chunk.offset + chunk.size);
      expect((chunk.compressed ? brotliDecompressSync(bytes) : bytes).toString()).toBe('<string>1.2.3</string>');
    }
    const pub = (await import('node:fs')).readFileSync(c.publicKeyFile, 'utf8');
    for (const file of m.files) expect(verifyListing(pub, { context: CONTEXT, version: '1.2.3', platform: 'darwin', file, signature: file.signature })).toBeNull();
  });

  it('accepts a public key checked out with CRLF line endings', async () => {
    const c = config();
    keygen(c);
    writeFileSync(c.publicKeyFile, readFileSync(c.publicKeyFile, 'utf8').replace(/\n/g, '\r\n'));
    bundle(c, 'arm64');
    bundle(c, 'x64');
    await expect(buildManifest(c, 'darwin', '1.2.3')).resolves.toMatchObject({ version: '1.2.3' });
  });

  it('refuses a missing arch, a platform not configured, and a second keygen', async () => {
    const c = config();
    keygen(c);
    bundle(c, 'arm64');
    await expect(buildManifest(c, 'darwin', '1.2.3')).rejects.toThrow(/x64.*is missing/);
    await expect(buildManifest(c, 'linux', '1.2.3')).rejects.toThrow(/builds nothing for linux/);
    expect(() => keygen(c)).toThrow(/already exists/);
  });
});

function bundle(c: ReleaseConfig, arch: string): void {
  const contents = path.join(c.dist, arch, 'App.app', 'Contents');
  mkdirSync(contents, { recursive: true });
  writeFileSync(path.join(contents, 'Info.plist'), '<string>1.2.3</string>');
}
