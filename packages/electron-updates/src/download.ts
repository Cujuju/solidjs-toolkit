import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import type { Fetch } from './feed';
import type { UpdateFile } from './manifest';

const PERCENT = 100;

/**
 * Downloads `url` to `dest`, keeping it only if its SHA-512 matches the signed listing `file`.
 * `onProgress` hears whole-percent steps.
 */
export async function downloadVerified(fetch: Fetch, url: string, file: UpdateFile, dest: string, onProgress: (percent: number) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: GitHub answered ${res.status}`);
  const partial = `${dest}.partial`;
  const hash = createHash('sha512');
  let received = 0;
  let shown = -1;
  const body = Readable.fromWeb(res.body as ReadableStream<Uint8Array>).on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    const percent = Math.min(PERCENT, Math.floor((received / file.size) * PERCENT));
    if (percent !== shown) onProgress((shown = percent));
  });
  try {
    await pipeline(body, createWriteStream(partial));
    if (hash.digest('base64') !== file.sha512) throw new Error('the download does not match the signed release listing');
    await rename(partial, dest);
  } catch (err) {
    await rm(partial, { force: true });
    throw err;
  }
}
