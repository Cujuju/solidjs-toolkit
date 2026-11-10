import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUSH_KEY_STEP_PX } from '../push.js';
import { TilingWorkspace } from '../TilingWorkspace.js';
import type { TileNode } from '../tileTree.js';

const WIDTH = 400;
const HEIGHT = 300;
const GAP = 10;
/** Margin and page padding under the workspace inside the scroller. */
const BELOW = 28;
const stack: TileNode = { kind: 'split', dir: 'column', sizes: [1, 1], children: [{ kind: 'tile', id: 'a' }, { kind: 'tile', id: 'b' }] };
const frame = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** A pushed workspace in a document scroller whose window bottom sits `visible` px below the workspace's top. */
function setup(visible: number) {
  const [heightPx, setHeightPx] = createSignal(HEIGHT);
  const view = render(() => (
    <TilingWorkspace layout={stack} onLayoutChange={(_next, h) => h !== undefined && setHeightPx(h)} gapPx={GAP} verticalResize="push" heightPx={heightPx()}>
      {(tile) => <div>{tile.id}</div>}
    </TilingWorkspace>
  ));
  const workspace = view.container.firstElementChild as HTMLElement;
  const top = window.innerHeight - visible;
  workspace.getBoundingClientRect = () => {
    const height = Number.parseFloat(workspace.style.height);
    return { top, left: 0, right: WIDTH, bottom: top + height, width: WIDTH, height, x: 0, y: top, toJSON: () => ({}) };
  };
  const scroller = document.documentElement;
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => workspace.getBoundingClientRect().bottom + BELOW });
  const scrollBy = vi.spyOn(scroller, 'scrollBy');
  return { ...view, workspace, heightPx, scrollBy };
}

describe('trailing space after a shrinking push', () => {
  it('scrolls up by exactly the space in view, so the content ends at its margin', async () => {
    const { getByLabelText, workspace, scrollBy } = setup(HEIGHT + BELOW);
    fireEvent.keyDown(getByLabelText('Resize the bottom tiles'), { key: 'ArrowUp' });
    expect(workspace.style.height).toBe(`${HEIGHT}px`);
    await frame();
    expect(scrollBy).toHaveBeenCalledWith({ top: -PUSH_KEY_STEP_PX, behavior: expect.any(String) });
  });

  it('drops space that is out of view at once, without scrolling', async () => {
    const { getByLabelText, workspace, scrollBy } = setup(HEIGHT / 2);
    fireEvent.keyDown(getByLabelText('Resize the bottom tiles'), { key: 'ArrowUp' });
    await frame();
    expect(scrollBy).not.toHaveBeenCalled();
    expect(workspace.style.height).toBe(`${HEIGHT - PUSH_KEY_STEP_PX}px`);
  });
});
