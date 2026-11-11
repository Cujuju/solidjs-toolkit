import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Published `src` (for the `solid`/`cujuju-source` conditions) must not carry the test suites.
const TEST_DIR_EXCLUSION = '!src/__tests__';

describe('publish files contract', () => {
  it(`a package that publishes src lists ${TEST_DIR_EXCLUSION} in files`, () => {
    const packageDir = process.env.PACKAGE_DIR;
    expect(packageDir, 'libTest sets PACKAGE_DIR').toBeTruthy();
    const { files = [] } = JSON.parse(readFileSync(join(packageDir!, 'package.json'), 'utf8')) as {
      files?: string[];
    };
    if (!files.includes('src')) return;
    expect(files).toContain(TEST_DIR_EXCLUSION);
  });
});
