import { describe, expect, it } from 'vitest';
import { render } from 'solid-js/web';
import { AccordionGroup } from '../AccordionGroup';
import { AccordionPanel } from '../AccordionPanel';
import { AccordionLeaf } from '../AccordionLeaf';

/**
 * A leaf is the terminal pane in BOTH orientations: without a flex `order` it sits at 0
 * and paints ahead of every panel.
 */
describe('vertical leaf order', () => {
  it('sorts the leaf after every panel', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = render(
      () => (
        <AccordionGroup orientation="vertical" mode="fill" policy="multi" height="400px">
          <AccordionPanel id="files" title="Files" defaultOpen>
            <div>files</div>
          </AccordionPanel>
          <AccordionPanel id="more" title="More">
            <div>more</div>
          </AccordionPanel>
          <AccordionLeaf id="detail" title="Detail" open>
            <div>detail</div>
          </AccordionLeaf>
        </AccordionGroup>
      ),
      container,
    );

    const orderOf = (el: Element): number => Number((el as HTMLElement).style.order);
    const leaf = container.querySelector('.acc-leaf');
    const panels = [...container.querySelectorAll('.acc-panel:not(.acc-leaf)')];
    expect(leaf).not.toBeNull();
    expect(panels).toHaveLength(2);

    const leafOrder = orderOf(leaf!);
    for (const p of panels) expect(leafOrder).toBeGreaterThan(orderOf(p));

    dispose();
    container.remove();
  });
});

describe('vertical chained leaves', () => {
  it('sort in chain order, not declaration order', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    // Declared child-first, so only the chain can put `outer` ahead of `inner`.
    const dispose = render(
      () => (
        <AccordionGroup orientation="vertical" mode="fill" policy="multi" height="400px">
          <AccordionPanel id="files" title="Files" defaultOpen>
            <div>files</div>
          </AccordionPanel>
          <AccordionLeaf id="inner" title="Inner" open parentId="outer">
            <div>inner</div>
          </AccordionLeaf>
          <AccordionLeaf id="outer" title="Outer" open parentId="files">
            <div>outer</div>
          </AccordionLeaf>
        </AccordionGroup>
      ),
      container,
    );

    const orderOf = (selector: string): number =>
      Number((container.querySelector(selector) as HTMLElement).style.order);
    const panel = orderOf('.acc-panel:not(.acc-leaf)');
    const leaves = [...container.querySelectorAll<HTMLElement>('.acc-leaf')];
    expect(leaves).toHaveLength(2);
    const byTitle = (t: string): number =>
      Number(leaves.find((el) => el.textContent?.includes(t))!.style.order);

    expect(byTitle('Outer')).toBeGreaterThan(panel);
    expect(byTitle('Inner')).toBeGreaterThan(byTitle('Outer'));

    dispose();
    container.remove();
  });
});
