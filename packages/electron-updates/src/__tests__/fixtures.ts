import { createHash, generateKeyPairSync } from 'node:crypto';
import type { Fetch } from '../feed';
import { manifestName, type UpdateManifest, type UpdatePlatform } from '../manifest';
import { signFile } from '../signing';

export const CONTEXT = 'test-app-update-v1';
const keys = generateKeyPairSync('ed25519');
export const PRIVATE_PEM = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
export const PUBLIC_PEM = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

export const sha512 = (data: Buffer): string => createHash('sha512').update(data).digest('base64');

export interface FakeRelease {
  version: string;
  prerelease?: boolean;
  draft?: boolean;
  /** Per platform: arch → file bytes. */
  builds: Partial<Record<UpdatePlatform, Record<string, Buffer>>>;
  /** Signs with this context instead of CONTEXT. */
  context?: string;
}

const BASE = 'https://example.test';

/** A fake GitHub: the releases API, manifests and files, served from `releases` (newest last). */
export function fakeGitHub(repo: string, releases: FakeRelease[]): { fetch: Fetch; urls: string[] } {
  const urls: string[] = [];
  const bodies = new Map<string, Buffer | string>();
  const apiReleases = releases.map((r) => {
    const assets: { name: string; browser_download_url: string }[] = [];
    for (const [platform, byArch] of Object.entries(r.builds) as [UpdatePlatform, Record<string, Buffer>][]) {
      const manifest: UpdateManifest = { version: r.version, platform, files: [] };
      for (const [arch, data] of Object.entries(byArch)) {
        const file = { arch, name: `App-${r.version}-${platform}-${arch}.bin`, sha512: sha512(data), size: data.length };
        manifest.files.push({ ...file, signature: signFile(PRIVATE_PEM, { context: r.context ?? CONTEXT, version: r.version, platform, file }) });
        const url = `${BASE}/${r.version}/${file.name}`;
        bodies.set(url, data);
        assets.push({ name: file.name, browser_download_url: url });
      }
      const url = `${BASE}/${r.version}/${manifestName(platform)}`;
      bodies.set(url, JSON.stringify(manifest));
      assets.push({ name: manifestName(platform), browser_download_url: url });
    }
    return { tag_name: `v${r.version}`, draft: r.draft ?? false, prerelease: r.prerelease ?? false, assets };
  });
  const newestFirst = [...apiReleases].reverse().filter((r) => !r.draft);
  bodies.set(`https://api.github.com/repos/${repo}/releases?per_page=30`, JSON.stringify(newestFirst));
  const latest = newestFirst.find((r) => !r.prerelease);
  if (latest) bodies.set(`https://api.github.com/repos/${repo}/releases/latest`, JSON.stringify(latest));
  const fetch: Fetch = async (url) => {
    urls.push(url);
    const body = bodies.get(url);
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body);
  };
  return { fetch, urls };
}
