import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { createRailPan, type RailPan } from '../railPan';
import type { AccordionGroupApi } from '../context';

/**
 * Rail pan TEARDOWN. A touch drag the UA claims fires `pointercancel` and no `pointerup`;
 * a stranded pan keeps `panning()` true and the guard set, so the rail goes dead.
 */

/** One macrotask turn, so Solid flushes the effects that bind the listeners. */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

/** `createRailPan` reads nothing off the group — it is in the options for the
 *  same reason the other gesture modules take it, so a stub suffices. */
const GROUP_STUB = {} as AccordionGroupApi;

interface Mounted {
  pan: RailPan;
  railEl: HTMLElement;
  dispose: () => void;
}

function mount(): Mounted {
  const railEl = document.createElement('div');
  document.body.appendChild(railEl);

  let pan!: RailPan;
  let dispose = (): void => {};
  createRoot((d) => {
    dispose = () => {
      d();
      railEl.remove();
    };
    pan = createRailPan({ railEl: () => railEl, group: GROUP_STUB });
  });

  return { pan, railEl, dispose };
}

/** A primary-button press on the rail BACKGROUND — entry point 3, the one a
 *  touch drag takes. */
function press(railEl: HTMLElement, y = 0): void {
  railEl.dispatchEvent(
    new PointerEvent('pointerdown', { clientY: y, bubbles: true, button: 0 }),
  );
}

function move(y: number): void {
  document.dispatchEvent(new PointerEvent('pointermove', { clientY: y, bubbles: true }));
}

function cancel(): void {
  document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
}

/** Past the 5px dead zone, so the pan is genuinely activated. */
const PAST_DEAD_ZONE_PX = 40;

describe('a pan ends when the UA cancels the pointer', () => {
  it('clears `panning` on pointercancel, so the rail buttons stay clickable', async () => {
    const rail = mount();
    await flush();

    press(rail.railEl);
    move(PAST_DEAD_ZONE_PX);
    expect(rail.pan.panning()).toBe(true);

    cancel();

    // `.acc-rail[data-panning='true'] .acc-rail-btn { pointer-events: none }` —
    // stuck true is a rail nothing can be clicked on.
    expect(rail.pan.panning()).toBe(false);
    expect(rail.railEl.getAttribute('data-panning')).toBe('false');

    rail.dispose();
  });

  it('releases the in-flight guard, so a later pan can still start', async () => {
    const rail = mount();
    await flush();

    // A press the UA takes before the dead zone is crossed: no activation, and
    // no `pointerup` will ever arrive for it.
    press(rail.railEl);
    cancel();

    // Inside this press's dead zone, far outside the cancelled one's: only a stranded gesture activates.
    const START_Y = 100;
    press(rail.railEl, START_Y);
    move(START_Y + 3);
    expect(rail.pan.panning()).toBe(false);

    move(START_Y + PAST_DEAD_ZONE_PX);
    expect(rail.pan.panning()).toBe(true);

    rail.dispose();
  });

  it('stops moving the rail once the gesture is cancelled', async () => {
    const rail = mount();
    await flush();

    press(rail.railEl);
    move(PAST_DEAD_ZONE_PX);
    cancel();

    // Every pointer move ANYWHERE on the page reached the stranded handler and
    // scrolled the rail from a dead gesture's start position.
    let scrolled = false;
    Object.defineProperty(rail.railEl, 'scrollTop', {
      get: () => 0,
      set: () => {
        scrolled = true;
      },
      configurable: true,
    });
    move(PAST_DEAD_ZONE_PX * 2);
    expect(scrolled).toBe(false);

    rail.dispose();
  });
});

describe('a pan follows only the pointer that started it', () => {
  const FIRST_POINTER = 1;
  const SECOND_POINTER = 2;

  it('ignores a second touch moving and lifting mid-pan', async () => {
    const rail = mount();
    await flush();
    const writes: number[] = [];
    Object.defineProperty(rail.railEl, 'scrollTop', {
      get: () => 0,
      set: (v: number) => {
        writes.push(v);
      },
      configurable: true,
    });

    rail.railEl.dispatchEvent(
      new PointerEvent('pointerdown', { clientY: 0, bubbles: true, button: 0, pointerId: FIRST_POINTER }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientY: PAST_DEAD_ZONE_PX, bubbles: true, pointerId: FIRST_POINTER }),
    );
    expect(rail.pan.panning()).toBe(true);
    const ownWrites = writes.length;

    document.dispatchEvent(
      new PointerEvent('pointermove', { clientY: PAST_DEAD_ZONE_PX * 10, bubbles: true, pointerId: SECOND_POINTER }),
    );
    expect(writes).toHaveLength(ownWrites);

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: SECOND_POINTER }));
    expect(rail.pan.panning()).toBe(true);

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: FIRST_POINTER }));
    expect(rail.pan.panning()).toBe(false);

    rail.dispose();
  });
});

describe('a press is cancellable before it becomes a pan', () => {
  it('Escape inside the dead zone releases the in-flight guard', async () => {
    const rail = mount();
    await flush();

    press(rail.railEl);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // A stranded first press would reject this one and activate on the next move.
    const START_Y = 100;
    press(rail.railEl, START_Y);
    move(START_Y + 3);
    expect(rail.pan.panning()).toBe(false);

    rail.dispose();
  });
});
