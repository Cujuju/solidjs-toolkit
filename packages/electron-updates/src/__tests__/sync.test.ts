import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, lstat, chmod, symlink, readlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CHUNKING, chunkFile } from '../chunker';
import { buildIndex } from '../node/pack';
import { parseIndex, indexName, type UpdateIndex } from '../updateIndex';
import { fetchUpdate } from '../sync';
import type { Fetch } from '../feed';

const digest = (b: Uint8Array): string => createHash('sha512').update(b).digest('base64');
function bytes(): Buffer {
  const data = Buffer.alloc(4 * 1024 * 1024);
  let state = 123456789;
  for (let i = 0; i < data.length; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    data[i] = state & 255;
  }
  return data;
}
const temp = (): Promise<string> => mkdtemp(join(tmpdir(), 'eu-sync-'));

it('chunks deterministically within bounds and resynchronizes after an insertion', async () => {
  const dir = await temp();
  const file = join(dir, 'file');
  const data = bytes();
  await writeFile(file, data);
  const before = await chunkFile(file);
  expect(await chunkFile(file)).toEqual(before);
  for (const c of before.slice(0, -1)) {
    expect(c.length).toBeGreaterThanOrEqual(CHUNKING.min);
    expect(c.length).toBeLessThanOrEqual(CHUNKING.max);
  }
  expect(before.reduce((sum, c) => sum + c.length, 0)).toBe(data.length);
  await writeFile(file, Buffer.concat([data.subarray(0, 100), Buffer.from('inserted bytes'), data.subarray(100)]));
  const hashes = new Set((await chunkFile(file)).map((c) => c.hash));
  expect(before.filter((c) => hashes.has(c.hash)).length).toBeGreaterThan(before.length * 0.9);
});

async function fixture(directory = false) {
  const dir = await temp();
  const source = join(dir, directory ? 'App.app' : 'App.exe');
  const seed = join(dir, directory ? 'old.app' : 'old.exe');
  const original = bytes();
  const changed = Buffer.from(original);
  changed.fill(42, 100, 2100);
  if (directory) {
    for (const root of [source, seed]) {
      await mkdir(join(root, 'Contents', 'MacOS'), { recursive: true });
      await writeFile(join(root, 'Contents', 'Info.plist'), '<string>1.2.3</string>');
      await writeFile(join(root, 'Contents', 'same'), 'unchanged '.repeat(10000));
      await symlink('MacOS/App', join(root, 'Contents', 'current'));
      await writeFile(join(root, 'Contents', 'MacOS', 'App'), root === source ? changed : original);
      await chmod(join(root, 'Contents', 'MacOS', 'App'), 0o755);
    }
  } else {
    await writeFile(source, changed);
    await writeFile(seed, original);
  }
  const platform = directory ? 'darwin' : 'win32';
  const index = await buildIndex(source, platform, 'x64', dir);
  const indexPath = join(dir, indexName(platform, 'x64'));
  const indexBytes = await readFile(indexPath);
  const pack = await readFile(join(dir, index.pack));
  const listing = { arch: 'x64', name: indexName(platform, 'x64'), size: indexBytes.length, sha512: digest(indexBytes), signature: '' };
  const output = join(dir, 'output');
  await mkdir(output);
  let fetched = 0;
  let tamper = false;
  let ignoreRange = false;
  const fetch: Fetch = async (url, init) => {
    if (url === 'index') return new Response(indexBytes);
    expect(url).toBe('pack');
    const range = new Headers(init?.headers).get('range');
    expect(range).toMatch(/^bytes=\d+-\d+$/);
    const [start, end] = range!.slice('bytes='.length).split('-').map(Number) as [number, number];
    const data = Buffer.from(pack.subarray(start, end + 1));
    fetched += data.length;
    if (tamper) data[0] = data[0]! ^ 255;
    // Multiple stream reads exercise chunk and gap boundaries.
    let at = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (at === data.length) { controller.close(); return; }
      const next = Math.min(at + 7001, data.length);
      controller.enqueue(data.subarray(at, next)); at = next;
    } });
    return new Response(body, { status: ignoreRange ? 200 : 206, headers: { 'Content-Range': `bytes ${start}-${end}/${pack.length}` } });
  };
  const progress: number[] = [];
  const run = (seeds = [seed]) => fetchUpdate({ fetch, listing, indexUrl: 'index', assets: new Map([[index.pack, 'pack']]), seeds, dir: output, onProgress: (p) => progress.push(p) });
  return { source, seed, index, pack, run, output, progress, fetched: () => fetched, tamper: () => { tamper = true; }, ignore: () => { ignoreRange = true; } };
}

describe('parseIndex', () => {
  it('rejects traversal, escaping links, bad chunk references and foreign chunking', async () => {
    const f = await fixture();
    const parse = (index: UpdateIndex) => parseIndex(brotliCompressSync(Buffer.from(JSON.stringify(index))));
    expect(parse(f.index)).toEqual(f.index);
    const traversal = structuredClone(f.index); traversal.entries[0]!.path = 'App/../escape';
    expect(() => parse(traversal)).toThrow();
    const link = structuredClone(f.index); link.entries = [{ type: 'symlink', path: 'App', target: '../escape' }];
    expect(() => parse(link)).toThrow();
    const refs = structuredClone(f.index);
    if (refs.entries[0]!.type === 'file') refs.entries[0]!.chunks = [999999];
    expect(() => parse(refs)).toThrow();
    const foreign = structuredClone(f.index); Object.assign(foreign.chunking, { algorithm: 'foreign' });
    expect(() => parse(foreign)).toThrow(/different updater version/);
  });
});

describe('fetchUpdate', () => {
  it('reuses an older seed, downloading less than half the target', async () => {
    const f = await fixture();
    const root = await f.run();
    expect(digest(await readFile(root))).toBe(digest(await readFile(f.source)));
    expect(f.fetched()).toBeLessThan(f.pack.length / 2);
    expect(f.progress.at(-1)).toBe(100);
  });
  it('reconstructs without a seed using the same ranges', async () => {
    const f = await fixture();
    expect(digest(await readFile(await f.run([])))).toBe(digest(await readFile(f.source)));
    expect(f.fetched()).toBe(f.pack.length);
  });
  it('needs no network pack bytes when all chunks are seeded', async () => {
    const f = await fixture();
    expect(digest(await readFile(await f.run([f.source])))).toBe(digest(await readFile(f.source)));
    expect(f.fetched()).toBe(0);
    expect(f.progress).toEqual([100]);
  });
  it('rejects a tampered chunk and leaves nothing staged', async () => {
    const f = await fixture(); f.tamper();
    await expect(f.run()).rejects.toThrow(/hash mismatch/);
    expect(existsSync(join(f.output, 'staged'))).toBe(false);
    expect(existsSync(join(f.output, 'fetched.partial'))).toBe(false);
  });
  it('rejects a server ignoring a partial range', async () => {
    const f = await fixture(); f.ignore();
    await expect(f.run()).rejects.toThrow(/range/);
    expect(existsSync(join(f.output, 'staged'))).toBe(false);
  });
  it('reconstructs compressed, deduplicated directory chunks', async () => {
    const dir = await temp();
    const source = join(dir, 'App.app');
    await mkdir(join(source, 'Contents'), { recursive: true });
    const data = Buffer.from('shared bytes '.repeat(10000));
    await writeFile(join(source, 'Contents', 'a'), data);
    await writeFile(join(source, 'Contents', 'b'), data);
    const index = await buildIndex(source, 'darwin', 'arm64', dir);
    expect(index.chunks.some((c) => c.compressed)).toBe(true);
    const files = index.entries.filter((e) => e.type === 'file');
    expect(files[0]!.chunks).toEqual(files[1]!.chunks);
    const indexData = await readFile(join(dir, indexName('darwin', 'arm64')));
    const pack = await readFile(join(dir, index.pack));
    const output = join(dir, 'output'); await mkdir(output);
    const root = await fetchUpdate({
      fetch: async (url) => new Response(url === 'index' ? indexData : pack),
      listing: { arch: 'arm64', name: indexName('darwin', 'arm64'), sha512: digest(indexData), size: indexData.length, signature: '' },
      indexUrl: 'index', assets: new Map([[index.pack, 'pack']]), seeds: [], dir: output, onProgress() {},
    });
    expect(digest(await readFile(join(root, 'Contents', 'a')))).toBe(digest(data));
    expect(digest(await readFile(join(root, 'Contents', 'b')))).toBe(digest(data));
  });
  it.skipIf(process.platform === 'win32')('rebuilds a bundle with nested directories, permissions and symlinks', async () => {
    const f = await fixture(true);
    const root = await f.run();
    for (const path of ['Contents/Info.plist', 'Contents/same', 'Contents/MacOS/App']) {
      expect(digest(await readFile(join(root, path)))).toBe(digest(await readFile(join(f.source, path))));
      expect((await lstat(join(root, path))).mode).toBe((await lstat(join(f.source, path))).mode);
    }
    expect(await readlink(join(root, 'Contents/current'))).toBe('MacOS/App');
    expect(f.fetched()).toBeLessThan(f.pack.length / 2);
  });
});
