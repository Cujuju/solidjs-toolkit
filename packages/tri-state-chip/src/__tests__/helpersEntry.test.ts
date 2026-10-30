/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import * as helpers from '../helpers';
import * as main from '../index';

// The `./helpers` subpath must load in workers and plain Node: no CSS, no component, no Solid.
const SOURCES = import.meta.glob<string>(['../helpers.ts', '../cycleTriState.ts'], { query: '?raw', import: 'default', eager: true });
const specifiers = (src: string): string[] =>
  Array.from(
    src.matchAll(/(?:^|\n)\s*(?:import\s+['"]([^'"]+)['"]|(?:import|export)\b[^;'"]*?\bfrom\s+['"]([^'"]+)['"])/g),
    (m) => m[1] ?? m[2],
  );

describe('helpers entry', () => {
  it('imports only the pure helper module, which imports nothing', () => {
    expect(specifiers(SOURCES['../helpers.ts'])).toEqual(['./cycleTriState']);
    expect(specifiers(SOURCES['../cycleTriState.ts'])).toEqual([]);
  });

  it('exports the same helpers as the package entry', () => {
    for (const [name, value] of Object.entries(helpers)) expect(main[name as keyof typeof main]).toBe(value);
  });
});
