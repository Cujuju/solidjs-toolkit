import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest, keygen, type ReleaseConfig } from '../node/release';
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
    updateFile: (_p, arch, v) => `App-${v}-${arch}-mac.zip`,
  };
}

describe('buildManifest', () => {
  it('signs every configured arch so the app verifies it', async () => {
    const c = config();
    keygen(c);
    writeFileSync(path.join(c.dist, 'App-1.2.3-arm64-mac.zip'), 'arm');
    writeFileSync(path.join(c.dist, 'App-1.2.3-x64-mac.zip'), 'intel');
    const m = await buildManifest(c, 'darwin', '1.2.3');
    expect(m.files.map((f) => [f.arch, f.size])).toEqual([['arm64', 3], ['x64', 5]]);
    const pub = (await import('node:fs')).readFileSync(c.publicKeyFile, 'utf8');
    for (const file of m.files) expect(verifyListing(pub, { context: CONTEXT, version: '1.2.3', platform: 'darwin', file, signature: file.signature })).toBeNull();
  });

  it('accepts a public key checked out with CRLF line endings', async () => {
    const c = config();
    keygen(c);
    writeFileSync(c.publicKeyFile, readFileSync(c.publicKeyFile, 'utf8').replace(/\n/g, '\r\n'));
    writeFileSync(path.join(c.dist, 'App-1.2.3-arm64-mac.zip'), 'arm');
    writeFileSync(path.join(c.dist, 'App-1.2.3-x64-mac.zip'), 'intel');
    await expect(buildManifest(c, 'darwin', '1.2.3')).resolves.toMatchObject({ version: '1.2.3' });
  });

  it('refuses a missing arch, a platform not configured, and a second keygen', async () => {
    const c = config();
    keygen(c);
    writeFileSync(path.join(c.dist, 'App-1.2.3-arm64-mac.zip'), 'arm');
    await expect(buildManifest(c, 'darwin', '1.2.3')).rejects.toThrow(/x64-mac\.zip is missing/);
    await expect(buildManifest(c, 'linux', '1.2.3')).rejects.toThrow(/builds nothing for linux/);
    expect(() => keygen(c)).toThrow(/already exists/);
  });
});
