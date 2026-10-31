/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { exportedComponents } from '../../../packages/_shared/contracts/exportedComponents';

/**
 * Coverage contract: every workspace package has a playground page listed in App.tsx, and every
 * component a package exports appears as JSX (`<Name`) on that page.
 */

const MANIFESTS = import.meta.glob('../../../packages/*/package.json');
const ENTRIES = import.meta.glob<string>('../../../packages/*/src/index.ts', { query: '?raw', import: 'default', eager: true });
const PAGES = import.meta.glob<string>('../pages/*Page.tsx', { query: '?raw', import: 'default', eager: true });
const APP = Object.values(import.meta.glob<string>('../App.tsx', { query: '?raw', import: 'default', eager: true }))[0];

const packageNames = Object.keys(MANIFESTS).map((path) => path.split('/').at(-2)!);
const pageIds = Array.from(APP.matchAll(/\{\s*id:\s*'([\w-]+)'/g), (m) => m[1]);
const pascal = (id: string) => id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
const pageSource = (name: string) => PAGES[`../pages/${pascal(name)}Page.tsx`];

describe('the export scanner itself', () => {
  it('keeps value exports and aliases, drops types, hooks and constants', () => {
    const entry = "export {\n  Alpha,\n  default as Beta, // note\n  type Chi,\n  createDelta,\n  EPS_ZETA,\n} from './x';\nexport function Gamma() {}";
    expect(exportedComponents(entry)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('playground page coverage', () => {
  it('discovers the workspace packages and their components', () => {
    expect(packageNames.length).toBeGreaterThan(0);
    expect(exportedComponents(ENTRIES['../../../packages/accordion-dock/src/index.ts'])).toContain('AccordionGroup');
  });

  it.each(packageNames)('%s has a page listed in App.tsx', (name) => {
    expect(pageIds).toContain(name);
    expect(pageSource(name), `missing pages/${pascal(name)}Page.tsx`).toBeDefined();
  });

  it.each(packageNames)('%s: every exported component appears on its page', (name) => {
    const entry = ENTRIES[`../../../packages/${name}/src/index.ts`] ?? '';
    const page = pageSource(name) ?? '';
    const absent = exportedComponents(entry).filter((component) => !new RegExp(`<${component}\\b`).test(page));
    expect(absent, `Show these on pages/${pascal(name)}Page.tsx`).toEqual([]);
  });
});
