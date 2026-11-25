/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Read through Vite's `import.meta.glob`: the package tsconfig carries no Node types.
const SOURCES = import.meta.glob('../*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const RELATIVE_IMPORT = /(?:from|import) '\.\/([^']+)'/g;
const DOM_GLOBAL = /\b(window|document|navigator|HTMLElement|Element|PointerEvent|MouseEvent|KeyboardEvent|DOMRect|requestAnimationFrame)\b/;

/** Every source file `model.ts` reaches through relative imports, as `../<name>` keys of SOURCES. */
function moduleGraph(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = SOURCES[file] ?? '';
    for (const [, spec] of source.matchAll(RELATIVE_IMPORT)) {
      const base = `../${spec!.replace(/\.js$/, '')}`;
      pending.push(`${base}.ts` in SOURCES ? `${base}.ts` : `${base}.tsx`);
    }
  }
  return [...seen];
}

describe('model entry', () => {
  it('reaches no component, stylesheet or DOM global', () => {
    const files = moduleGraph('../model.ts');
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      expect(file).toMatch(/\.ts$/);
      expect(SOURCES[file], file).toBeDefined();
      expect(SOURCES[file], file).not.toMatch(DOM_GLOBAL);
    }
  });
});
