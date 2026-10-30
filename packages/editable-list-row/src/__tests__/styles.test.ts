/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

const CSS = Object.values(
  import.meta.glob('../styles.css', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

// Asserts the source: the contract is where declarations live, not a computed value. CONTRIBUTING §5.
describe('editable-list-row styles', () => {
  it('declares theme defaults only on :root inside @layer cujuju-defaults', () => {
    expect(CSS).toMatch(/@layer cujuju-defaults \{\s*:root \{\s*--cuj-elr-/);
    // Any declaration outside that block would shadow a consumer's scoped override.
    const outside = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@layer cujuju-defaults \{\s*:root \{[^}]*\}\s*\}/, '');
    expect(outside).not.toMatch(/--cuj-elr-[\w-]+\s*:/);
  });
});
