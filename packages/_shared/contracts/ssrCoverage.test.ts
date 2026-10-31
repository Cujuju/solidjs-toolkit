import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportedComponents } from './exportedComponents';

// CONTRIBUTING §1: every exported component renders on the server, closed and open where it opens.
const SSR_TEST = 'src/__tests__/render.ssr.test.tsx';

describe('SSR coverage contract', () => {
  it(`every exported component is server-rendered in ${SSR_TEST}`, () => {
    const packageDir = process.env.PACKAGE_DIR;
    expect(packageDir, 'libTest sets PACKAGE_DIR').toBeTruthy();
    const entry = join(packageDir!, 'src/index.ts');
    const components = existsSync(entry) ? exportedComponents(readFileSync(entry, 'utf8')) : [];
    const ssrFile = join(packageDir!, SSR_TEST);
    const ssr = existsSync(ssrFile) ? readFileSync(ssrFile, 'utf8') : '';
    const missing = components.filter((name) => !new RegExp(`<${name}\\b`).test(ssr));
    expect(missing, `Render these with renderToString in ${SSR_TEST}`).toEqual([]);
  });
});
