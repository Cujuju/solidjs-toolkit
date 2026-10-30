import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// CONTRIBUTING §5: a package's custom-property declarations live in `@layer cujuju-defaults`, so unlayered consumer CSS
// wins whatever the load order. Misses: tokens written from JS.

const DEFAULTS_LAYER = /^@layer\s+cujuju-defaults$/;
const COMMENT_OR_STRING = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const CUSTOM_PROPERTY_START = /^\s*--[\w-]+\s*:/;

/** Each custom property declared outside `@layer cujuju-defaults`, as `<selector> <--name>`. */
export function unlayeredTokens(css: string): string[] {
  // Strings become "" so their text never reads as a declaration or a brace.
  const text = css.replace(COMMENT_OR_STRING, (m) => (m.startsWith('/*') ? '' : '""'));
  const preludes: string[] = [];
  const hits: string[] = [];
  let buf = '';
  /** Brace depth inside a custom-property value, e.g. `--x: { a: 1 }`; its `;` are masked. */
  let valueDepth = 0;
  const collect = (declarations: string): void => {
    if (preludes.some((p) => DEFAULTS_LAYER.test(p))) return;
    for (const m of declarations.matchAll(/(?:^|;)\s*(--[\w-]+)\s*:/g)) hits.push(`${preludes.at(-1) ?? '(top level)'} ${m[1]}`);
  };
  for (const ch of text) {
    if (valueDepth > 0) {
      if (ch === '{') valueDepth++;
      else if (ch === '}') valueDepth--;
      buf += ch === ';' ? ' ' : ch;
    } else if (ch === '{') {
      // Declarations before a nested block belong to the enclosing rule.
      const cut = buf.lastIndexOf(';') + 1;
      if (CUSTOM_PROPERTY_START.test(buf.slice(cut))) {
        valueDepth = 1;
        buf += ch;
        continue;
      }
      collect(buf.slice(0, cut));
      preludes.push(buf.slice(cut).trim().replace(/\s+/g, ' '));
      buf = '';
    } else if (ch === '}') {
      collect(buf);
      preludes.pop();
      buf = '';
    } else buf += ch;
  }
  return hits;
}

function collectCssFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectCssFiles(full, acc);
    else if (entry.endsWith('.css')) acc.push(full);
  }
  return acc;
}

describe('the token-layer scanner itself', () => {
  it('flags tokens outside the defaults layer, at any nesting', () => {
    expect(unlayeredTokens(':root { --a: 1; }')).toEqual([':root --a']);
    expect(unlayeredTokens('@media (x) { .c { color: red; --b: calc(var(--a) * 2); } }')).toEqual(['.c --b']);
  });

  it('accepts tokens inside the layer, nested or not, and ignores var() reads and comments', () => {
    expect(unlayeredTokens('@layer cujuju-defaults { :root { --a: 1; } @supports (x) { .c { --b: 2; } } }')).toEqual([]);
    expect(unlayeredTokens('.c { width: var(--a); /* --b: 1; */ }')).toEqual([]);
  });

  it('attributes declarations before a nested block to the enclosing rule', () => {
    expect(unlayeredTokens('.c { --a: 1; &:hover { color: red; } }')).toEqual(['.c --a']);
  });

  it('reads braces in a custom-property value as part of the value, not a rule', () => {
    expect(unlayeredTokens('.c { --theme: { fg: red; --inner: 1 }; --b: 2; }')).toEqual(['.c --theme', '.c --b']);
  });

  it('ignores declaration-like text and braces inside quoted strings', () => {
    expect(unlayeredTokens('.c { content: "; --example: red"; }')).toEqual([]);
    expect(unlayeredTokens(".c { --a: '}'; --b: 1; }")).toEqual(['.c --a', '.c --b']);
  });
});

describe('CSS token layer contract', () => {
  it('every custom property a package declares is inside @layer cujuju-defaults', () => {
    const packageDir = process.env.PACKAGE_DIR;
    expect(packageDir, 'libTest sets PACKAGE_DIR').toBeTruthy();
    const srcDir = join(packageDir!, 'src');
    const files = existsSync(srcDir) ? collectCssFiles(srcDir) : [];
    const offenders = files.flatMap((file) =>
      unlayeredTokens(readFileSync(file, 'utf8')).map((hit) => `${relative(packageDir!, file).split(sep).join('/')}: ${hit}`));
    expect(offenders, `Move these declarations into \`@layer cujuju-defaults\`. Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });
});
