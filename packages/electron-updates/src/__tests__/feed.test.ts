import { describe, expect, it } from 'vitest';
import { findUpdate, type FindOptions } from '../feed';
import { parseManifest } from '../manifest';
import { compareVersions, tagVersion } from '../version';
import { CONTEXT, fakeGitHub, PUBLIC_PEM, type FakeRelease } from './fixtures';

const REPO = 'me/app-updates';
const bin = (s: string) => Buffer.from(s);

function find(releases: FakeRelease[], over: Partial<FindOptions> = {}) {
  const { fetch } = fakeGitHub(REPO, releases);
  return findUpdate({ fetch, repo: REPO, channel: 'stable', platform: 'win32', arch: 'x64', current: '0.1.0', publicKey: PUBLIC_PEM, context: CONTEXT, ...over });
}

describe('versions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.2', '0.2.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
  it('reads only v-prefixed numeric tags', () => {
    expect(tagVersion('v0.41.3')).toBe('0.41.3');
    expect(tagVersion('nightly')).toBeNull();
    expect(tagVersion('v1.0.0-beta')).toBeNull();
  });
});

describe('findUpdate', () => {
  const stable: FakeRelease = { version: '0.2.0', builds: { win32: { x64: bin('stable') } } };
  const nightly: FakeRelease = { version: '0.3.0', prerelease: true, builds: { win32: { x64: bin('nightly') } } };

  it('stable sees only the latest full release', async () => {
    expect((await find([stable, nightly]))?.release.version).toBe('0.2.0');
  });

  it('nightly sees prereleases too', async () => {
    const found = await find([stable, nightly], { channel: 'nightly' });
    expect(found?.release.version).toBe('0.3.0');
    expect(found?.release.prerelease).toBe(true);
  });

  it('is up to date when nothing is newer', async () => {
    expect(await find([stable], { current: '0.2.0' })).toBeNull();
    expect(await find([], { channel: 'stable' })).toBeNull();
  });

  it('skips a newer release still lacking this platform or arch', async () => {
    const macOnly: FakeRelease = { version: '0.4.0', prerelease: true, builds: { darwin: { arm64: bin('mac') } } };
    const armOnly: FakeRelease = { version: '0.5.0', prerelease: true, builds: { win32: { arm64: bin('arm') } } };
    expect((await find([nightly, macOnly, armOnly], { channel: 'nightly' }))?.release.version).toBe('0.3.0');
  });

  it('rejects a listing signed for another app', async () => {
    await expect(find([{ ...stable, context: 'other-app-v1' }])).rejects.toThrow(/signature is not valid/);
  });

  it('ignores drafts', async () => {
    expect(await find([{ ...nightly, draft: true }], { channel: 'nightly' })).toBeNull();
  });
});

describe('parseManifest', () => {
  it('rejects malformed manifests', () => {
    expect(() => parseManifest('{"version":"1","platform":"beos","files":[]}')).toThrow(/malformed/);
    expect(() => parseManifest('{"version":"1","platform":"linux","files":[{"arch":"x64"}]}')).toThrow(/malformed file/);
  });
});
