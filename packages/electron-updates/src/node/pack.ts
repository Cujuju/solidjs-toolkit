import { lstat, open, readdir, readlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { CHUNKING, chunkFile } from '../chunker';
import { indexName, type UpdateIndex } from '../updateIndex';
import { sha512File } from '../signing';

/** Quality 4 favors release speed; throughput has not been measured. */
const BROTLI_QUALITY = 4;
/** Preserve permission bits without file-type bits. */
const MODE_MASK = 0o777;
const compress = (data: Buffer): Buffer => brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } });

export async function buildIndex(source: string, platform: string, arch: string, dist: string): Promise<UpdateIndex> {
  const directory = (await lstat(source)).isDirectory();
  const index: UpdateIndex = { format: 1, chunking: CHUNKING, pack: directory ? `update-${platform}-${arch}.pack` : basename(source), chunks: [], entries: [] };
  const unique = new Map<string, number>();
  const pack = directory ? await open(join(dist, index.pack), 'w') : null;
  let offset = 0;
  async function walk(file: string, path: string): Promise<void> {
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) {
      index.entries.push({ type: 'symlink', path, target: await readlink(file) });
    } else if (stat.isDirectory()) {
      index.entries.push({ type: 'dir', path, mode: stat.mode & MODE_MASK });
    } else if (stat.isFile()) {
      const refs: number[] = [];
      const input = await open(file, 'r');
      try {
        for (const c of await chunkFile(file)) {
          let ref = directory ? unique.get(c.hash) : undefined;
          if (ref === undefined) {
            ref = index.chunks.length;
            let data: Buffer = Buffer.alloc(c.length);
            await input.read(data, 0, data.length, c.offset);
            const packed = directory ? compress(data) : data;
            const compressed = packed.length < data.length;
            if (compressed) data = packed;
            index.chunks.push({ hash: c.hash, offset: directory ? offset : c.offset, size: data.length, length: c.length, compressed });
            if (pack) { await pack.writeFile(data); offset += data.length; }
            unique.set(c.hash, ref);
          }
          refs.push(ref);
        }
      } finally { await input.close(); }
      index.entries.push({ type: 'file', path, mode: stat.mode & MODE_MASK, size: stat.size, sha512: await sha512File(file), chunks: refs });
    } else throw new Error(`unsupported update source: ${file}`);
  }
  const paths: { file: string; path: string }[] = [];
  async function collect(file: string, path: string): Promise<void> {
    paths.push({ file, path });
    if ((await lstat(file)).isDirectory()) {
      for (const name of await readdir(file)) await collect(join(file, name), `${path}/${name}`);
    }
  }
  try {
    await collect(source, basename(source));
    paths.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    for (const entry of paths) await walk(entry.file, entry.path);
  } finally { await pack?.close(); }
  await writeFile(join(dist, indexName(platform, arch)), compress(Buffer.from(JSON.stringify(index))));
  return index;
}
