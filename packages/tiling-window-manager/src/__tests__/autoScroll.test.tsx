import { describe, expect, it, vi } from 'vitest';
import { scrollSpeed } from '../ResizeHandle.js';

const TOP = 0;
const BOTTOM = 900;

describe('scrollSpeed', () => {
  it('never scrolls for a press already in the edge band until the pointer moves past it toward the edge', () => {
    const origin = BOTTOM - 20;
    expect(scrollSpeed(origin, origin, TOP, BOTTOM)).toBe(0);
    expect(scrollSpeed(origin + 1, origin, TOP, BOTTOM)).toBe(0);
    expect(scrollSpeed(origin + 20, origin, TOP, BOTTOM)).toBeGreaterThan(0);
  });

  it('speeds up toward the edge, caps past it, and scrolls up near the top', () => {
    const origin = BOTTOM / 2;
    expect(scrollSpeed(BOTTOM - 10, origin, TOP, BOTTOM)).toBeGreaterThan(scrollSpeed(BOTTOM - 40, origin, TOP, BOTTOM));
    expect(scrollSpeed(BOTTOM + 500, origin, TOP, BOTTOM)).toBe(scrollSpeed(BOTTOM, origin, TOP, BOTTOM));
    expect(scrollSpeed(TOP + 5, origin, TOP, BOTTOM)).toBeLessThan(0);
    expect(scrollSpeed(origin, origin, TOP, BOTTOM)).toBe(0);
  });
});

describe('ResizeHandle drag', () => {
  it('measures in workspace pixels, so scrolling mid-drag keeps the divider under a still pointer', async () => {
    const { fireEvent, render } = await import('@solidjs/testing-library');
    const { ResizeHandle } = await import('../ResizeHandle.js');
    const onDraft = vi.fn();
    const { container } = render(() => (
      <div data-testid="workspace">
        <ResizeHandle dir="column" rect={{ x: 0, y: 100, width: 400, height: 8 }} onDraft={onDraft}
          onBegin={() => undefined} onCommit={() => undefined} onCancel={() => undefined} onEqualise={() => undefined} />
      </div>
    ));
    const workspace = container.firstElementChild as HTMLElement;
    let top = 0;
    workspace.getBoundingClientRect = () => ({ top, left: 0, right: 400, bottom: 500, width: 400, height: 500, x: 0, y: top, toJSON: () => ({}) });
    const handle = workspace.querySelector('[role="separator"]')!;
    fireEvent.pointerDown(handle, { button: 0, clientY: 104, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 124, pointerId: 1 });
    expect(onDraft).toHaveBeenLastCalledWith(20, expect.anything());
    // The page scrolls 50px down: the workspace moves up, the pointer stays put.
    top = -50;
    window.dispatchEvent(new Event('scroll'));
    expect(onDraft).toHaveBeenLastCalledWith(70, expect.anything());
  });
});
