import { describe, expect, it } from 'vitest';
import { scrollSpeed } from '../ResizeHandle';

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
