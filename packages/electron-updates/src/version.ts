/** Versions are dotted numbers (`0.41.3`); release tags add a `v`. */
const TAG = /^v(\d+(?:\.\d+)*)$/;

export const releaseTag = (version: string): string => `v${version}`;

/** The version a release tag names; null for a tag that names none. */
export const tagVersion = (tag: string): string | null => TAG.exec(tag)?.[1] ?? null;

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
