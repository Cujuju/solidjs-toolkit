import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';

/** Small chunks preserve reuse around changed bytes. */
const MIN_CHUNK = 16 * 1024;
/** The average balances index size and download reuse. */
const AVG_CHUNK = 64 * 1024;
/** Caps memory and the cost of a changed chunk. */
const MAX_CHUNK = 256 * 1024;
export const CHUNKING = { algorithm: 'gear-cdc-v1', min: MIN_CHUNK, avg: AVG_CHUNK, max: MAX_CHUNK } as const;
/** Normalization favors cuts near the average. */
const STRICT_MASK = (AVG_CHUNK * 2) - 1;
/** After the average, cuts become more likely. */
const LOOSE_MASK = (AVG_CHUNK / 2) - 1;
/** One bounded read per event-loop turn. */
const READ_SIZE = MAX_CHUNK;
/** One gear value for every possible byte. */
const BYTE_VALUES = 256;
const GEAR = Array.from({ length: BYTE_VALUES }, (_, i) => createHash('sha256').update(`gear-cdc-v1:${i}`).digest().readUInt32BE(0));
export interface Chunk { offset: number; length: number; hash: string }

export async function chunkFile(path: string): Promise<Chunk[]> {
  const file = await open(path, 'r');
  const input = Buffer.alloc(READ_SIZE);
  const chunk = Buffer.alloc(MAX_CHUNK);
  const chunks: Chunk[] = [];
  let length = 0;
  let offset = 0;
  let gear = 0;
  const cut = (): void => {
    chunks.push({ offset, length, hash: createHash('sha256').update(chunk.subarray(0, length)).digest('base64') });
    offset += length;
    length = 0;
    gear = 0;
  };
  try {
    for (;;) {
      const { bytesRead } = await file.read(input, 0, input.length, null);
      if (!bytesRead) break;
      for (const byte of input.subarray(0, bytesRead)) {
        chunk[length++] = byte;
        if (length < MIN_CHUNK) continue;
        gear = ((gear << 1) + GEAR[byte]!) >>> 0;
        const mask = length < AVG_CHUNK ? STRICT_MASK : LOOSE_MASK;
        if ((gear & mask) === 0 || length === MAX_CHUNK) cut();
      }
      await setImmediate();
    }
    if (length) cut();
    return chunks;
  } finally { await file.close(); }
}
