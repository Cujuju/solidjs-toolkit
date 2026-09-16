/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import { AccordionLeaf } from '../AccordionLeaf';
import { Breadcrumb } from '../Breadcrumb';

/**
 * The CSS and the components must agree about NAMES: a stylesheet selecting something no
 * component emits fails silently. See DESIGN_NOTES.md § src/__tests__/domContract.test.tsx:9.
 */

/*
 * Sources read through Vite's `import.meta.glob`, not `node:fs`: the playground tsconfig
 * carries no Node types, so `readFileSync` typecheck-fails even while the test passes.
 */
const CSS_SOURCES = import.meta.glob('../*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CODE_SOURCES = import.meta.glob(['../*.ts', '../*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const INDEX_SOURCE = import.meta.glob('../index.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * One dock exercising every element the derived pairs name. `autoHide` is OFF: jsdom lacks
 * `:popover-open`. See DESIGN_NOTES.md § src/__tests__/domContract.test.tsx:75.
 */
function renderFixture(): { querySelectorAll: (s: string) => NodeListOf<Element>; cleanup: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(
    () => (
      <AccordionGroup orientation="horizontal" mode="fill" policy="multi" animated>
        <AccordionPanel id="one" title="One" badge="warning" defaultOpen>
          <div>one</div>
        </AccordionPanel>
        <AccordionPanel id="two" title="Two">
          <div>two</div>
        </AccordionPanel>
        <AccordionLeaf id="leaf" title="Leaf" open parentId="one">
          <div>leaf</div>
        </AccordionLeaf>
        <Breadcrumb />
      </AccordionGroup>
    ),
    container,
  );
  return {
    querySelectorAll: (selector) => container.querySelectorAll(selector),
    cleanup: () => {
      dispose();
      container.remove();
    },
  };
}

/** Comments are stripped from BOTH sides: this file's own prose names `data-overflow`, the
 *  misspelling above, and a scan counting comments would pass a stylesheet still selecting it. */
function stripComments(source: string, kind: 'css' | 'ts'): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return kind === 'css' ? withoutBlocks : withoutBlocks.replace(/^\s*\/\/.*$/gm, '');
}

function joinStripped(sources: Record<string, string>, kind: 'css' | 'ts'): string {
  return Object.values(sources)
    .map((source) => stripComments(source, kind))
    .join('\n');
}

const css = joinStripped(CSS_SOURCES, 'css');
const code = joinStripped(CODE_SOURCES, 'ts');

/** Class names a stylesheet selects: `.acc-thing`. */
const cssClasses = new Set(Array.from(css.matchAll(/\.(acc-[a-z0-9-]+)/g), (m) => m[1]));
/** Data attributes a stylesheet selects: `[data-thing]`, `[data-thing='x']`. */
const cssAttributes = new Set(Array.from(css.matchAll(/\[(data-[a-z0-9-]+)/g), (m) => m[1]));

/** Every `acc-*` / `data-*` token the components mention, anywhere. Deliberately broad on
 *  this side: the failure guarded against is a name that appears nowhere. */
const codeClasses = new Set(Array.from(code.matchAll(/(?<![\w-])(acc-[a-z0-9-]+)/g), (m) => m[1]));
const codeAttributes = new Set(
  Array.from(code.matchAll(/(?<![\w-])(data-[a-z0-9-]+)/g), (m) => m[1]),
);

describe('CSS and components agree about names', () => {
  it('found stylesheets and components to compare', () => {
    // Guards the guard: a path change making both scans empty would turn every assertion
        // below into a vacuous pass.
    expect(cssClasses.size).toBeGreaterThan(10);
    expect(codeClasses.size).toBeGreaterThan(10);
    expect(cssAttributes.size).toBeGreaterThan(5);
  });

  it('every class the CSS selects is emitted by a component', () => {
    const orphans = [...cssClasses].filter((name) => !codeClasses.has(name)).sort();
    expect(orphans, `CSS selects ${orphans.join(', ')} but no component emits it`).toEqual([]);
  });

  it('every data-attribute the CSS selects is emitted by a component', () => {
    // The `data-flyout` and `data-overflow-mode` defects, both in this direction.
    const orphans = [...cssAttributes].filter((name) => !codeAttributes.has(name)).sort();
    expect(orphans, `CSS selects [${orphans.join('], [')}] but no component emits it`).toEqual([]);
  });
});

/**
 * Necessary, not sufficient: the name scan asks whether a name exists anywhere, not whether it
 * sits on the element the CSS targets. See DESIGN_NOTES.md § src/__tests__/domContract.test.tsx:176.
 */
const CSS_COMPOUND_PAIRS: readonly (readonly [string, string])[] = (() => {
  const pairs = new Set<string>();
  for (const match of css.matchAll(/\.(acc-[a-z0-9-]+)((?:\[[^\]]+\])+)/g)) {
    for (const attr of match[2].matchAll(/\[(data-[a-z0-9-]+)/g)) {
      pairs.add(`${match[1]}|${attr[1]}`);
    }
  }
  return [...pairs].map((p) => p.split('|') as [string, string]).sort();
})();

/**
 * Pairs whose attribute exists only DURING a live gesture, so a static render cannot show
 * them. Each entry names the gesture that produces it, so the claim is verifiable.
 */
const GESTURE_ONLY_PAIRS: ReadonlySet<string> = new Set([
  // Set by the rail-pan controller while space is held or a pan moves. Both are written
    // by an effect on the rail itself, so they DO appear at rest.
]);

describe('the element the CSS targets is the element that carries the attribute', () => {
  it('derived at least a dozen pairs from the stylesheets', () => {
    // Guards the guard again: a regex that stopped matching would make every
    // assertion below vacuous.
    expect(CSS_COMPOUND_PAIRS.length).toBeGreaterThan(10);
  });

  it('every derived pair is present in a rendered dock', () => {
    const dom = renderFixture();
    try {
      const missing = CSS_COMPOUND_PAIRS.filter(([cls, attr]) => {
        if (GESTURE_ONLY_PAIRS.has(`${cls}|${attr}`)) return false;
        const elements = dom.querySelectorAll(`.${cls}`);
        if (elements.length === 0) return false; // not exercised by the fixture
        return !Array.from(elements).some((el) => el.hasAttribute(attr));
      });
      expect(
        missing.map(([c, a]) => `.${c}[${a}]`),
        'CSS styles these, but no such element in a rendered dock carries the attribute',
      ).toEqual([]);
    } finally {
      dom.cleanup();
    }
  });

  it('the fixture actually exercises the elements the pairs name', () => {
    // Without this, "not exercised by the fixture" above silently excuses every
    // pair, and the test passes by rendering nothing of interest.
    const dom = renderFixture();
    try {
      const classes = new Set(CSS_COMPOUND_PAIRS.map(([cls]) => cls));
      const unexercised = [...classes].filter((cls) => dom.querySelectorAll(`.${cls}`).length === 0);
      expect(unexercised, `the fixture renders no .${unexercised.join(', .')}`).toEqual([]);
    } finally {
      dom.cleanup();
    }
  });
});

describe('every stylesheet is actually loaded', () => {
  /*
   * The third defect: `autoHide.css` and `rail.css` were correct and had never reached a
   * browser because nothing imported them. `index.ts` is the only entry point.
   */
  it('index.ts imports every .css file in the directory', () => {
    const entry = Object.values(INDEX_SOURCE)[0];
    expect(entry, 'index.ts was not readable').toBeTypeOf('string');

    const present = Object.keys(CSS_SOURCES).map((path) => path.split('/').pop() ?? path);
    expect(present.length).toBeGreaterThan(0);

    const missing = present.filter((name) => !entry.includes(`./${name}`));
    expect(missing, `not imported by index.ts: ${missing.join(', ')}`).toEqual([]);
  });
});

/**
 * ARIA relationships, asserted against a rendered dock. References between elements typecheck
 * and render while broken: `aria-controls` naming a missing id reads correct to everything
 * except a screen reader.
 */
describe('the rail is a real tablist', () => {
  it('every tab controls a panel that exists', () => {
    const dom = renderFixture();
    try {
      const tabs = Array.from(dom.querySelectorAll('[role="tab"]'));
      expect(tabs.length).toBeGreaterThan(0);

      const dangling = tabs
        .map((tab) => tab.getAttribute('aria-controls'))
        .filter((id) => id === null || dom.querySelectorAll(`#${CSS.escape(id)}`).length === 0);
      expect(dangling, 'tabs whose aria-controls names no element').toEqual([]);
    } finally {
      dom.cleanup();
    }
  });

  it('what a tab controls is a tabpanel', () => {
    // Half a pattern is not the pattern: a tab pointing at a `region` leaves the
    // relationship unstated in the direction that matters for navigation.
    const dom = renderFixture();
    try {
      const tab = dom.querySelectorAll('[role="tab"]')[0];
      const id = tab.getAttribute('aria-controls')!;
      const panel = dom.querySelectorAll(`#${CSS.escape(id)}`)[0];
      expect(panel.getAttribute('role')).toBe('tabpanel');
    } finally {
      dom.cleanup();
    }
  });

  it('no element points aria-labelledby at an id that is not in the document', () => {
    // The dangling-label defect: in horizontal the labelling element is the column title
        // bar, which renders only while the panel is OPEN, so a closed panel referenced a missing id.
    const dom = renderFixture();
    try {
      const referrers = Array.from(dom.querySelectorAll('[aria-labelledby]'));
      const dangling = referrers
        .map((el) => el.getAttribute('aria-labelledby')!)
        .filter((id) => dom.querySelectorAll(`#${CSS.escape(id)}`).length === 0);
      expect(dangling, 'aria-labelledby values with no matching element').toEqual([]);
    } finally {
      dom.cleanup();
    }
  });
});

/**
 * The cascade-layer split: TOKENS layered, COMPONENT RULES unlayered. Breaking it is silent.
 * See DESIGN_NOTES.md § src/__tests__/domContract.test.tsx:331.
 */
describe('cascade layers', () => {
  /** The text inside each `@layer … { … }` block, found by brace matching —
   *  regex alone cannot pair braces, and the blocks nest (a media query holds a
   *  layer holding a token block). */
  function layeredRegions(source: string): string[] {
    const regions: string[] = [];
    const opener = /@layer[^{]*\{/g;
    let match: RegExpExecArray | null;
    while ((match = opener.exec(source)) !== null) {
      let depth = 1;
      let i = match.index + match[0].length;
      const start = i;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
      }
      regions.push(source.slice(start, i - 1));
    }
    return regions;
  }

  it('no component rule is inside a layer', () => {
    /*
         * A rule counts as a COMPONENT rule by what it DECLARES, not what it selects.
         * See DESIGN_NOTES.md § src/__tests__/domContract.test.tsx:370.
         */
    const offenders: string[] = [];
    for (const [path, raw] of Object.entries(CSS_SOURCES)) {
      const source = stripComments(raw, 'css');
      for (const region of layeredRegions(source)) {
        for (const rule of region.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          const selector = rule[1].trim();
          if (!selector.includes('.acc-')) continue;
          const declaresRealProperty = rule[2]
            .split(';')
            .map((d) => d.trim())
            .filter((d) => d.length > 0)
            .some((d) => !d.startsWith('--'));
          if (declaresRealProperty) offenders.push(`${path.split('/').pop()}: ${selector}`);
        }
      }
    }
    expect(
      offenders,
      'these component rules sit inside @layer, where an unlayered rule beats them regardless of specificity',
    ).toEqual([]);
  });

  it('the token block IS layered, in the file that owns the defaults', () => {
    // The other half. Tokens must stay layered so a consumer restating
    // `--acc-accent` unlayered wins without specificity games — dropping the layer
    // entirely would be the opposite over-correction.
    const styles = Object.entries(CSS_SOURCES).find(([p]) => p.endsWith('styles.css'));
    expect(styles, 'styles.css was not found by the glob').toBeDefined();
    const regions = layeredRegions(stripComments(styles![1], 'css'));
    expect(regions.join('\n')).toContain('--acc-accent');
  });
});
