/**
 * Finds the update for a channel in a GitHub repo's releases. Stable: the repo's latest release.
 * Nightly: the newest release, prereleases included. Both need this platform's manifest.
 */
import { manifestName, parseManifest, type UpdateFile, type UpdateManifest, type UpdatePlatform } from './manifest';
import { verifyListing } from './signing';
import { compareVersions, tagVersion } from './version';

export type UpdateChannel = 'stable' | 'nightly';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Releases a nightly check reads (GitHub's default page). A newer release still lacking this platform's build is skipped. */
export const NIGHTLY_LOOKBACK = 30;

const GITHUB_API = 'https://api.github.com';
const GITHUB_JSON = { accept: 'application/vnd.github+json' };
const HTTP_NOT_FOUND = 404;

export interface Release {
  version: string;
  prerelease: boolean;
  /** Asset name → download URL. */
  assets: Map<string, string>;
}

interface GitHubRelease {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown }[];
}

/** A published release with a version tag; null for drafts and other tags. */
export function toRelease(r: GitHubRelease): Release | null {
  const version = typeof r.tag_name === 'string' ? tagVersion(r.tag_name) : null;
  if (!version || r.draft === true) return null;
  const assets = new Map<string, string>();
  for (const a of r.assets ?? []) {
    if (typeof a.name === 'string' && typeof a.browser_download_url === 'string') assets.set(a.name, a.browser_download_url);
  }
  return { version, prerelease: r.prerelease === true, assets };
}

/** Releases newer than `current` that carry `platform`'s manifest, newest first. */
export function candidates(releases: Release[], platform: UpdatePlatform, current: string): Release[] {
  return releases
    .filter((r) => r.assets.has(manifestName(platform)) && compareVersions(r.version, current) > 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

async function getJson(fetch: Fetch, url: string): Promise<unknown> {
  const res = await fetch(url, { headers: GITHUB_JSON });
  // A repo with no releases yet answers /releases/latest with 404.
  if (res.status === HTTP_NOT_FOUND) return null;
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${url}`);
  return res.json();
}

export async function listReleases(fetch: Fetch, repo: string, channel: UpdateChannel): Promise<Release[]> {
  if (channel === 'stable') {
    const latest = (await getJson(fetch, `${GITHUB_API}/repos/${repo}/releases/latest`)) as GitHubRelease | null;
    const release = latest ? toRelease(latest) : null;
    return release && !release.prerelease ? [release] : [];
  }
  const all = (await getJson(fetch, `${GITHUB_API}/repos/${repo}/releases?per_page=${NIGHTLY_LOOKBACK}`)) as GitHubRelease[] | null;
  return (all ?? []).map(toRelease).filter((r): r is Release => r !== null);
}

export interface FoundUpdate {
  release: Release;
  manifest: UpdateManifest;
  file: UpdateFile;
  url: string;
}

export interface FindOptions {
  fetch: Fetch;
  repo: string;
  channel: UpdateChannel;
  platform: UpdatePlatform;
  arch: string;
  current: string;
  publicKey: string;
  context: string;
}

/** The newest signed update for this platform and arch; null when up to date. Throws on a bad listing. */
export async function findUpdate(o: FindOptions): Promise<FoundUpdate | null> {
  for (const release of candidates(await listReleases(o.fetch, o.repo, o.channel), o.platform, o.current)) {
    const res = await o.fetch(release.assets.get(manifestName(o.platform))!);
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${manifestName(o.platform)}`);
    const manifest = parseManifest(await res.text());
    if (manifest.version !== release.version || manifest.platform !== o.platform) {
      throw new Error(`release ${release.version} carries a manifest for ${manifest.platform} ${manifest.version}`);
    }
    const file = manifest.files.find((f) => f.arch === o.arch);
    // This release has no build for this arch; an older one may.
    if (!file) continue;
    const problem = verifyListing(o.publicKey, { context: o.context, version: manifest.version, platform: o.platform, file, signature: file.signature });
    if (problem) throw new Error(`update ${release.version} was rejected: ${problem}`);
    const url = release.assets.get(file.name);
    if (!url) throw new Error(`release ${release.version} lists ${file.name} but does not carry it`);
    return { release, manifest, file, url };
  }
  return null;
}
