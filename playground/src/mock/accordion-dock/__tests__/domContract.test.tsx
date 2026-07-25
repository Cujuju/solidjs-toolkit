import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import { AccordionLeaf } from '../AccordionLeaf';
import { Breadcrumb } from '../Breadcrumb';

/**
 * The CSS and the components must agree about NAMES.
 *
 * This is the single most expensive defect class in this control's history, and
 * it has the same shape every time: a stylesheet selects something no component
 * emits, so a correct rule is simply never applied. Nothing errors. There is no
 * console message, no failed build, no type error — a missing style has no
 * failure state, it just looks like a layout bug and gets diagnosed as one.
 *
 * Three shipped instances, all found by eye, none catchable by tsc:
 *
 *   - `autoHide.css` styled `.acc-panel[data-flyout='true']` to take a flying-out
 *     panel's column out of the layout, and `AccordionPanel` never set the
 *     attribute. The column kept its slot and painted its title bar over the
 *     flyout floating above it.
 *   - `rail.css` selected `[data-overflow-mode]` and the group emitted
 *     `data-overflow` — one word apart. Every overflow-strategy rule was inert, so
 *     the rail fell back to a scrollbar in a 40px strip, which is precisely what
 *     the overflow work existed to remove.
 *   - `autoHide.css` and `rail.css` were never IMPORTED at all. Both were correct
 *     and neither had ever reached a browser.
 *
 * WHAT THIS ASSERTS, AND WHY ONLY THIS DIRECTION
 *
 * Every `.acc-*` class and every `[data-*]` attribute a stylesheet SELECTS must
 * appear somewhere in the components. The reverse is deliberately not asserted:
 * emitting a name no CSS styles is legitimate and common — `data-no-drag` is a
 * behavioural marker, `data-panel-id` is a measurement hook, `acc-flyout-shell` is
 * documented as a marker with no rule of its own. Flagging those would produce a
 * test that is noisy in the safe direction and therefore gets suppressed.
 *
 * It is a text scan, not a parse. That is a real limitation and it is the reason
 * the check is scoped to name EXISTENCE rather than to selector correctness: it
 * cannot tell whether `[data-open='true']` is ever actually set to `'true'`. What
 * it can tell — and what all three defects above were — is that a name on one side
 * has no counterpart on the other.
 */

/*
 * Sources are read through Vite's own `import.meta.glob`, not through `node:fs`.
 *
 * Two reasons, in order of weight. The playground's tsconfig carries no Node
 * types, so `readFileSync`/`__dirname` typecheck-fail even while the test passes —
 * and a test that only runs green in one of the two checks is a test someone will
 * eventually delete. Second, the glob is resolved by the same bundler that builds
 * the control, so "which files are in this directory" is answered by the tool that
 * actually decides it rather than by a directory walk that can drift from it.
 */
const CSS_SOURCES = import.meta.glob('../*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CODE_SOURCES = import.meta.glob(['../*.ts', '../*.tsx', '../vendor/*.ts'], {
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
 * One dock exercising every element the derived pairs name.
 *
 * `horizontal` because that is the configuration with a rail and an overflow mode;
 * a badge because `.acc-badge` only exists when a panel declares one; a leaf and a
 * `<Breadcrumb>` because `.acc-breadcrumb-crumb[data-leaf]` is styled and neither
 * appears otherwise.
 *
 * `autoHide` is deliberately OFF. jsdom does not implement the `:popover-open`
 * pseudo-class, so rendering an open flyout throws inside the popover primitive.
 * That costs nothing here: `data-flyout` is emitted unconditionally as
 * `'true'`/`'false'`, so the pair under test is present in the docked state too,
 * and the flyout's own geometry is covered by the browser suite where a real
 * popover exists.
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

/** Comments are stripped from BOTH sides before matching.
 *
 *  Not a detail: this file's own module comment names `data-overflow`, the
 *  misspelling from the second defect above, and `AccordionGroup` documents it at
 *  the site of the fix. A scan that counted comments would find that name "emitted"
 *  and pass a stylesheet still selecting it — the check would be satisfied by the
 *  very prose describing the bug. */
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

/** Every `acc-*` / `data-*` token the components mention — in JSX, in a selector
 *  string, or in an exported constant. The scan is deliberately broad on this side:
 *  a name that appears ANYWHERE in the code has a counterpart, and the failure this
 *  guards against is a name that appears nowhere. */
const codeClasses = new Set(Array.from(code.matchAll(/(?<![\w-])(acc-[a-z0-9-]+)/g), (m) => m[1]));
const codeAttributes = new Set(
  Array.from(code.matchAll(/(?<![\w-])(data-[a-z0-9-]+)/g), (m) => m[1]),
);

describe('CSS and components agree about names', () => {
  it('found stylesheets and components to compare', () => {
    // Guards the guard: a path change that made both scans empty would otherwise
    // turn every assertion below into a vacuous pass — the same "silently stopped
    // working" failure the whole file exists to catch.
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
 * The name scan above is necessary and not sufficient, and the gap is worth
 * stating exactly: it asks whether a name exists ANYWHERE in the components, not
 * whether it is on the element the CSS targets.
 *
 * That is precisely the shape of the `data-flyout` defect. The attribute was
 * emitted — by the rail BUTTON — while `autoHide.css` selected it on the
 * `.acc-panel`, so a text scan finds the name present and passes. Simulated
 * against this file: removing `data-flyout` from `AccordionPanel` leaves all four
 * name-scan assertions green.
 *
 * So this block closes it by rendering a dock and asking the question of the DOM.
 * The pairs are DERIVED from the stylesheets — every compound selector of the form
 * `.acc-thing[data-attr]` — rather than listed by hand, so a rule added tomorrow
 * is checked without anyone remembering to add it here.
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
 * Pairs whose attribute exists only DURING a live gesture, so a static render
 * cannot show them.
 *
 * Kept explicit and short. Each entry is a claim that the attribute's absence at
 * rest is correct, not an exemption for a rule nobody checked — and each names the
 * gesture that produces it, so a reader can verify the claim without running
 * anything.
 */
const GESTURE_ONLY_PAIRS: ReadonlySet<string> = new Set([
  // Set by the rail-pan controller while the space modifier is held / a pan is
  // moving. Both are written by an effect on the rail element itself, so they DO
  // appear at rest — listed here only if that ever changes.
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
   * The third defect: `autoHide.css` and `rail.css` were written, were correct, and
   * had never reached a browser because nothing imported them. `index.ts` is the
   * only entry point, so a stylesheet missing from its import list is a stylesheet
   * that does not exist as far as the running control is concerned.
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
 * The ARIA relationships, asserted against a rendered dock.
 *
 * These are references BETWEEN elements, which is exactly the kind of thing that
 * typechecks, renders, looks right and is still broken: `aria-controls` naming an
 * id that does not exist reads as a correctly-wired tab to everything except a
 * screen reader. Nothing else in the suite would notice.
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
    // The dangling-label defect: in horizontal, the labelling element is the column
    // title bar, which renders only while the panel is OPEN — so a closed panel
    // referenced an id that was not there, leaving the region with no accessible
    // name at all.
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
 * The cascade-layer split: TOKENS layered, COMPONENT RULES unlayered.
 *
 * This is the one architectural rule in the stylesheets, and breaking it is
 * completely silent — an unlayered declaration beats a layered one OUTRIGHT, ahead
 * of specificity, so a component rule that moves into the layer does not become
 * weaker in some measurable way, it simply stops applying.
 *
 * It has already happened. `autoHide.css` was wrapped in `@layer cujuju-defaults`
 * to "match styles.css", on the strength of a header comment that said defaults
 * live in a layer without mentioning that only the TOKEN block does. Every rule in
 * the file lost, and the one that mattered —
 * `.acc-panel[data-flyout='true'] { display: none }` — meant a flying-out panel's
 * docked column was never removed from the layout, so it kept its slot and painted
 * its title bar over the flyout in front of it. Found by eye, in a screenshot.
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
     * A rule counts as a COMPONENT rule by what it DECLARES, not by what it
     * selects. That distinction is the whole test.
     *
     * The naive version — "any `.acc-*` selector inside a layer" — flags
     * `:is(.acc-group, .acc-flyout-host)[data-density='compact']`, which is a token
     * override: it selects a class because density is set as an attribute on the
     * group (and restated on the Portal'd flyout host, which escapes the group's
     * scope), and it declares nothing but `--acc-*`. That rule BELONGS in the layer
     * for the same reason `:root` does — a consumer overriding a density token
     * unlayered should win.
     *
     * So: a rule inside a layer may declare custom properties only.
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
