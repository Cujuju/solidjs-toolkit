/**
 * The update manifest: one `update-<platform>.json` per platform in each release, listing the signed
 * update file for each architecture.
 */
export type UpdatePlatform = 'win32' | 'darwin' | 'linux';

export const UPDATE_PLATFORMS: readonly UpdatePlatform[] = ['win32', 'darwin', 'linux'];

export interface UpdateFile {
  arch: string;
  /** The release asset's name. */
  name: string;
  /** Base64 SHA-512 of the file. */
  sha512: string;
  size: number;
  /** Base64 Ed25519 signature over signedMessage(). */
  signature: string;
}

export interface UpdateManifest {
  version: string;
  platform: UpdatePlatform;
  files: UpdateFile[];
}

export const manifestName = (platform: UpdatePlatform): string => `update-${platform}.json`;

export const isUpdatePlatform = (p: string): p is UpdatePlatform => (UPDATE_PLATFORMS as readonly string[]).includes(p);

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function parseFile(v: unknown): UpdateFile {
  const f = v as Partial<UpdateFile> | null;
  if (!f || !isString(f.arch) || !isString(f.name) || !isString(f.sha512) || !isString(f.signature) || !Number.isSafeInteger(f.size)) {
    throw new Error('the update manifest lists a malformed file');
  }
  return { arch: f.arch, name: f.name, sha512: f.sha512, size: f.size as number, signature: f.signature };
}

/** Parses and shape-checks a manifest; throws on anything else. Signatures are checked separately. */
export function parseManifest(text: string): UpdateManifest {
  const m = JSON.parse(text) as Partial<UpdateManifest> | null;
  if (!m || !isString(m.version) || !isString(m.platform) || !isUpdatePlatform(m.platform) || !Array.isArray(m.files)) {
    throw new Error('the update manifest is malformed');
  }
  return { version: m.version, platform: m.platform, files: m.files.map(parseFile) };
}
