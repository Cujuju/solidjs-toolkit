/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createComponent } from 'solid-js';
import { Collapsible } from '../Collapsible';

/**
 * Markup/stylesheet cascade contract: jsdom applies UA `[hidden] { display: none }` under
 * author rules, so an unconditional wrapper `display` un-hides collapsed content.
 */
const CSS_SOURCES = import.meta.glob('../styles.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function renderCollapsible(props: Parameters<typeof Collapsible>[0]): {
  dispose: () => void;
  container: HTMLDivElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dispose = render(() => createComponent(Collapsible, props), container);
  return {
    dispose: () => { dispose(); container.remove(); },
    container,
  };
}

// jsdom's CSSOM rejects a whole sheet on one unsupported at-rule, so rules are inserted per top-level block.
function topLevelBlocks(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) {
      blocks.push(text.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  return blocks;
}

let sheet: CSSStyleSheet;

beforeAll(() => {
  const style = document.createElement('style');
  document.head.appendChild(style);
  sheet = style.sheet as CSSStyleSheet;
  for (const block of topLevelBlocks(CSS_SOURCES['../styles.css'])) {
    try {
      sheet.insertRule(block, sheet.cssRules.length);
    } catch {
      // Unparseable in jsdom (e.g. @layer); irrelevant to the wrapper's display.
    }
  }
});

afterEach(() => {
  document.querySelectorAll('.ccl-root').forEach((el) => el.remove());
});

describe('Collapsible stylesheet', () => {
  it('a hidden content wrapper computes display: none under the shipped CSS', () => {
    const wrapperRuleLoaded = [...sheet.cssRules].some((r) => r.cssText.startsWith('.ccl-content-wrapper {'));
    expect(wrapperRuleLoaded).toBe(true);

    const { dispose, container } = renderCollapsible({
      title: 'Filters',
      defaultOpen: false,
      children: 'body',
    });
    const wrapper = container.querySelector('.ccl-content-wrapper') as HTMLElement;
    expect(wrapper.hidden).toBe(true);
    expect(getComputedStyle(wrapper).display).toBe('none');

    (container.querySelector('.ccl-header') as HTMLButtonElement).click();
    expect(wrapper.hidden).toBe(false);
    expect(getComputedStyle(wrapper).display).toBe('contents');
    dispose();
  });

  // Pre-Grid engines skip the animated @supports block, so `display: contents` would leave
  // collapsed content visible. jsdom cannot evaluate `@supports not`, so assert the source.
  it('ships a display: none fallback for engines without CSS Grid', () => {
    expect(CSS_SOURCES['../styles.css']).toMatch(
      /@supports not \(grid-template-rows: 0fr\) \{\s*\.ccl-root\[data-animated="true"\]\[data-open="false"\] \.ccl-content-wrapper \{\s*display: none;/,
    );
  });
});
