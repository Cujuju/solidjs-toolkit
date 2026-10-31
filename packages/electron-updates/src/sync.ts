import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, open, readdir, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { chunkFile } from './chunker';
import type { Fetch } from './feed';
import type { UpdateFile } from './manifest';
import { parseIndex, type IndexChunk, type UpdateIndex } from './updateIndex';

/** A small gap costs less than another redirect round trip. */
const RANGE_GAP = 256 * 1024;
/** Progress uses whole percentages. */
const PERCENT = 100;
const hash = (data: Uint8Array): string => createHash('sha256').update(data).digest('base64');
interface Location { file: string; offset: number; length: number }
interface Range { start: number; end: number; chunks: IndexChunk[] }
interface FetchOptions {
  fetch: Fetch; listing: UpdateFile; indexUrl: string; assets: Map<string, string>;
  seeds: string[]; dir: string; onProgress: (percent: number) => void;
}

async function scanSeeds(seeds: string[], index: UpdateIndex): Promise<Map<string, Location>> {
  const wanted = new Set(index.chunks.map((c) => c.hash));
  const locations = new Map<string, Location>();
  async function scan(file: string): Promise<void> {
    try {
      const stat = await lstat(file);
      if (stat.isDirectory()) {
        for (const child of await readdir(file)) await scan(join(file, child));
      } else if (stat.isFile()) {
        for (const c of await chunkFile(file)) if (wanted.has(c.hash)) locations.set(c.hash, { file, offset: c.offset, length: c.length });
      }
    } catch { /* Missing or unreadable seeds do not prevent an update. */ }
  }
  for (const file of seeds) await scan(file);
  return locations;
}

function rangesFor(chunks: IndexChunk[]): Range[] {
  const ranges: Range[] = [];
  for (const c of [...chunks].sort((a, b) => a.offset - b.offset)) {
    const last = ranges.at(-1);
    if (last && c.offset - last.end - 1 <= RANGE_GAP) {
      last.end = Math.max(last.end, c.offset + c.size - 1);
      last.chunks.push(c);
    } else ranges.push({ start: c.offset, end: c.offset + c.size - 1, chunks: [c] });
  }
  return ranges;
}

async function fetchMissing(o: FetchOptions, index: UpdateIndex, locations: Map<string, Location>, partial: string): Promise<void> {
  const url = o.assets.get(index.pack);
  if (!url) throw new Error(`release does not carry ${index.pack}`);
  const ranges = rangesFor(index.chunks.filter((c) => !locations.has(c.hash)));
  const total = ranges.reduce((sum, r) => sum + r.end - r.start + 1, 0);
  const packSize = index.chunks.reduce((end, c) => Math.max(end, c.offset + c.size), 0);
  let received = 0;
  let shown = -1;
  let written = 0;
  const output = await open(partial, 'w');
  try {
    if (!total) o.onProgress(PERCENT);
    for (const range of ranges) {
      const res = await o.fetch(url, { headers: { Range: `bytes=${range.start}-${range.end}` } });
      const expected = `bytes ${range.start}-${range.end}/${packSize}`;
      if (!(res.status === 206 && res.headers.get('content-range') === expected) && !(res.status === 200 && range.start === 0 && range.end + 1 === packSize)) {
        throw new Error('pack server did not honor the requested range');
      }
      if (!res.body) throw new Error('pack response has no body');
      const reader = res.body.getReader();
      let position = range.start;
      let current = 0;
      let data = Buffer.alloc(range.chunks[0]!.size);
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (position + value.length > range.end + 1) throw new Error('pack range size mismatch');
          let at = 0;
          while (at < value.length) {
            const c = range.chunks[current];
            if (!c) { position += value.length - at; break; }
            if (position < c.offset) {
              const skip = Math.min(value.length - at, c.offset - position);
              at += skip; position += skip; continue;
            }
            const count = Math.min(value.length - at, c.offset + c.size - position);
            data.set(value.subarray(at, at + count), position - c.offset);
            at += count; position += count;
            if (position === c.offset + c.size) {
              const raw = c.compressed ? brotliDecompressSync(data) : data;
              if (raw.length !== c.length || hash(raw) !== c.hash) throw new Error('pack chunk hash mismatch');
              await output.writeFile(raw);
              locations.set(c.hash, { file: partial, offset: written, length: raw.length });
              written += raw.length;
              current++;
              if (range.chunks[current]) data = Buffer.alloc(range.chunks[current]!.size);
            }
          }
          received += value.length;
          const percent = Math.floor(received / total * PERCENT);
          if (percent !== shown) o.onProgress((shown = percent));
        }
        if (position !== range.end + 1 || current !== range.chunks.length) throw new Error('pack range size mismatch');
      } finally { await reader.cancel(); reader.releaseLock(); }
    }
  } finally { await output.close(); }
}

async function assemble(index: UpdateIndex, staged: string, locations: Map<string, Location>): Promise<string> {
  await mkdir(staged, { recursive: true });
  const dirs = index.entries.filter((e) => e.type === 'dir').sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  for (const e of dirs) await mkdir(join(staged, e.path), { recursive: true });
  for (const e of index.entries) {
    if (e.type !== 'file') continue;
    const path = join(staged, e.path);
    await mkdir(dirname(path), { recursive: true });
    const output = await open(path, 'w');
    const sha = createHash('sha512');
    let size = 0;
    try {
      for (const i of e.chunks) {
        const c = index.chunks[i]!;
        const location = locations.get(c.hash)!;
        const input = await open(location.file, 'r');
        const data = Buffer.alloc(c.length);
        try {
          const { bytesRead } = await input.read(data, 0, data.length, location.offset);
          if (bytesRead !== c.length || hash(data) !== c.hash) throw new Error('seed or fetched chunk hash mismatch');
        } finally { await input.close(); }
        await output.writeFile(data);
        sha.update(data); size += data.length;
      }
    } finally { await output.close(); }
    if (size !== e.size || sha.digest('base64') !== e.sha512) throw new Error('rebuilt file hash mismatch');
    await chmod(path, e.mode);
  }
  for (const e of index.entries) if (e.type === 'symlink') await symlink(e.target, join(staged, e.path));
  for (const e of dirs.reverse()) await chmod(join(staged, e.path), e.mode);
  return resolve(staged, index.entries[0]!.path.split('/')[0]!);
}

export async function fetchUpdate(o: FetchOptions): Promise<string> {
  const staged = join(o.dir, 'staged');
  const partial = join(o.dir, 'fetched.partial');
  try {
    const res = await o.fetch(o.indexUrl);
    if (!res.ok) throw new Error(`index download failed: ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length !== o.listing.size || createHash('sha512').update(data).digest('base64') !== o.listing.sha512) {
      throw new Error('the download does not match the signed release listing');
    }
    const index = parseIndex(data);
    const locations = await scanSeeds(o.seeds, index);
    await fetchMissing(o, index, locations, partial);
    return await assemble(index, staged, locations);
  } catch (err) {
    await rm(staged, { recursive: true, force: true });
    throw err;
  } finally { await rm(partial, { force: true }); }
}
