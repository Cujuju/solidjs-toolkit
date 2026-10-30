/** Ed25519 signatures over update files: the release script signs, the app verifies. */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { UpdateFile, UpdatePlatform } from './manifest';

/** What a signature covers besides the file's hash. */
export interface SignedFields {
  /** Per-app string, so one app's signatures never verify for another app sharing the key. */
  context: string;
  version: string;
  platform: UpdatePlatform;
  file: Pick<UpdateFile, 'arch' | 'name' | 'sha512' | 'size'>;
}

/** Version, platform and arch are signed, so an old or foreign file can't be relisted as this update. */
export function signedMessage({ context, version, platform, file }: SignedFields): Buffer {
  return Buffer.from([context, version, platform, file.arch, file.name, file.sha512, String(file.size)].join('\n'), 'utf8');
}

/** Base64 SHA-512 of a file. */
export function sha512File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('base64')));
  });
}

export function signFile(privateKeyPem: string, fields: SignedFields): string {
  // Ed25519 hashes internally: no digest argument.
  return sign(null, signedMessage(fields), createPrivateKey(privateKeyPem)).toString('base64');
}

export function publicKeyOf(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString();
}

function parsePublicKey(pem: string): KeyObject {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('the update public key is not an Ed25519 key');
  return key;
}

/** Checks a listing's signature; returns the failure reason, or null. */
export function verifyListing(publicKeyPem: string, fields: SignedFields & { signature: string }): string | null {
  const ok = verify(null, signedMessage(fields), parsePublicKey(publicKeyPem), Buffer.from(fields.signature, 'base64'));
  return ok ? null : 'the update signature is not valid for this app';
}
