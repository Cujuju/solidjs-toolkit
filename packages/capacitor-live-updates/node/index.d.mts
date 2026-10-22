export type NativeDir = [dir: string, files: RegExp];

export interface FingerprintOptions {
  /** Relative to the app root, e.g. '../pnpm-lock.yaml' in a workspace. Default 'package-lock.json'. */
  lockfile?: string;
  /** The plugin lists `cap sync` writes. */
  pluginLists?: string[];
  /** The app's own native code: [directory, file-name pattern]. */
  nativeDirs?: NativeDir[];
  /** Config files hashed whole. Default ['capacitor.config.ts']. */
  configFiles?: string[];
}

export const DEFAULT_PLUGIN_LISTS: string[];
export const DEFAULT_NATIVE_DIRS: NativeDir[];
export function buildRev(options: { roots: string[]; ref?: string; envVar?: string }): number | null;
export function nativeFingerprint(appRoot: string, options?: FingerprintOptions): string;
export function nativeVersion(appVersion: string, rev: number, fingerprint: string): string;
export function pnpmPackages(lockfileText: string): [name: string, version: string][];
export function cspAllows(html: string, url: string): boolean;

export interface PublishSource {
  rev: number;
  /** The bundle label; must end in `-r<rev>`. */
  version: string;
  /** Identifies what was built, e.g. a sha; a rerun with the same rev must match it. */
  commit: string;
  subject: string;
}

export interface BuildResult {
  /** Where the Capacitor config is; only read. */
  appDir: string;
  distDir: string;
  fingerprint: string;
}

export interface ManifestEntry {
  rev: number;
  version: string;
  commit: string;
  url: string;
  checksum: string;
  sessionKey: string;
}

export interface PublishOptions {
  appId: string;
  /** Release title prefix. */
  title: string;
  /** Asset and temp-dir name prefix. */
  assetPrefix: string;
  /** The public updates repo, "owner/name". */
  repo: string;
  /** Private signing key (Capgo key v2). */
  keyPath: string;
  source: PublishSource;
  build: (workDir: string) => Promise<BuildResult>;
  entryHtml?: string;
  capgoCli?: string;
  dryRun?: boolean;
}

export const CAPGO_CLI: string;
export class PublishError extends Error {}
export function manifestUrl(repo: string): string;
export function checkMonotonic(manifest: { bundles?: Record<string, ManifestEntry> }, fingerprint: string, entry: ManifestEntry, repo?: string): boolean;
export function publishLiveUpdate(options: PublishOptions): Promise<ManifestEntry | null>;
export function gitSource(root: string, ref?: string): PublishSource;
export function snapshotBuild(options: {
  root: string;
  commit: string;
  command?: string[];
  env?: Record<string, string>;
  distDir?: string;
  lockfile?: string;
  fingerprint?: (snapshotDir: string) => string;
}): (workDir: string) => Promise<BuildResult>;
