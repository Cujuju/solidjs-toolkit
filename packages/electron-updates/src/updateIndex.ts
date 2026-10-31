import { posix } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { CHUNKING } from './chunker';

export interface IndexChunk { hash: string; offset: number; size: number; length: number; compressed: boolean }
export type IndexEntry =
  | { type: 'dir'; path: string; mode: number }
  | { type: 'file'; path: string; mode: number; size: number; sha512: string; chunks: number[] }
  | { type: 'symlink'; path: string; target: string };
export interface UpdateIndex { format: 1; chunking: typeof CHUNKING; pack: string; chunks: IndexChunk[]; entries: IndexEntry[] }
export const indexName = (platform: string, arch: string): string => `update-${platform}-${arch}.index`;
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const string = (s: unknown): s is string => typeof s === 'string' && s.length > 0;
const relative = (s: string): boolean => !s.includes('\\') && !/^[a-z]:/i.test(s) && s.split('/').every((p) => p !== '' && p !== '.' && p !== '..');
const invalid = (): never => { throw new Error('the update index is malformed'); };

export function parseIndex(buf: Uint8Array): UpdateIndex {
  const v = JSON.parse(brotliDecompressSync(buf).toString()) as UpdateIndex;
  if (!v || v.format !== 1 || !v.chunking || Object.keys(v.chunking).length !== Object.keys(CHUNKING).length || Object.keys(CHUNKING).some((k) => v.chunking[k as keyof typeof CHUNKING] !== CHUNKING[k as keyof typeof CHUNKING])) {
    throw new Error('the release was made by a different updater version');
  }
  if (!string(v.pack) || !relative(v.pack) || v.pack.includes('/') || !Array.isArray(v.chunks) || !Array.isArray(v.entries) || !v.entries.length) invalid();
  for (const c of v.chunks) {
    if (!c || !string(c.hash) || !integer(c.offset) || !integer(c.size) || !integer(c.length) || !c.size || !c.length || typeof c.compressed !== 'boolean') invalid();
    if (!c.compressed && c.size !== c.length) invalid();
  }
  let root: string | undefined;
  const paths = new Map<string, IndexEntry>();
  for (const e of v.entries) {
    if (!e || !string(e.path) || !relative(e.path)) invalid();
    const first = e.path.split('/')[0]!;
    if (root && first !== root) invalid();
    root = first;
    if (paths.has(e.path)) invalid();
    paths.set(e.path, e);
    if (e.type === 'dir' || e.type === 'file') {
      if (!integer(e.mode)) invalid();
      if (e.type === 'file') {
        if (!integer(e.size) || !string(e.sha512) || !Array.isArray(e.chunks)) invalid();
        let total = 0;
        for (const i of e.chunks) {
          if (!integer(i) || !v.chunks[i]) invalid();
          total += v.chunks[i]!.length;
        }
        if (e.size !== total) invalid();
      }
    } else if (e.type === 'symlink') {
      if (!string(e.target) || e.target.includes('\\') || posix.isAbsolute(e.target) || /^[a-z]:/i.test(e.target)) invalid();
      const resolved = posix.normalize(posix.join(posix.dirname(e.path), e.target));
      if (resolved !== root && !resolved.startsWith(`${root}/`)) invalid();
    } else invalid();
  }
  for (const e of v.entries) {
    let parent = posix.dirname(e.path);
    while (parent !== '.') {
      if (paths.get(parent)?.type !== 'dir') invalid();
      parent = posix.dirname(parent);
    }
  }
  return v;
}
