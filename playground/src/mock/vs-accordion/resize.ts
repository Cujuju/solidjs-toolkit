import { createSignal, type Accessor } from 'solid-js';

/**
 * Splitter drag engine.
 *
 * The model is deliberately CONSERVATIVE: a drag moves the boundary between exactly
 * two adjacent open panels, adding to one and taking the same amount from the other.
 * The group's total extent never changes, so a resize cannot make the dock overflow
 * its container or leave a gap — the two failure modes of the naive "just set this
 * panel's width" approach.
 *
 * Sizes are seeded from the DOM at drag start rather than tracked continuously:
 * before the first drag every panel is sized by the mode (`fill` splits evenly,
 * `natural` uses a token width), and those computed sizes are exactly what the user
 * sees and expects to start dragging FROM.
 */

/** Movement below this is a click, not a drag — matches the reorder primitive's
 *  activation distance so the two gestures agree on what counts as intent. */
const RESIZE_ACTIVATE_PX = 0;

/** Fallback floor when a panel declares no `minSize`. Small enough to allow a very
 *  narrow column, large enough that a panel can never be dragged to zero and become
 *  impossible to grab again. */
export const DEFAULT_MIN_SIZE_PX = 60;

export interface ResizeHost {
  /** Growth axis: 'x' for horizontal columns, 'y' for vertical fill panels. */
  axis: Accessor<'x' | 'y'>;
  /** +1 when pointer-forward grows the dragged panel, -1 when the axis is mirrored
   *  (rail docked right, so columns grow leftward). */
  direction: Accessor<1 | -1>;
  /** Every open panel in visual sequence — the set a drag is allowed to redistribute
   *  between. */
  visualOpenIds: Accessor<readonly string[]>;
  elementOf: (id: string) => HTMLElement | undefined;
  minSizeOf: (id: string) => number;
  sizes: Accessor<Readonly<Record<string, number>>>;
  setSizes: (next: Record<string, number>) => void;
}

export interface ResizeApi {
  begin: (id: string, e: PointerEvent) => void;
  resizing: Accessor<boolean>;
}

export function createResize(host: ResizeHost): ResizeApi {
  const [resizing, setResizing] = createSignal(false);

  const begin = (id: string, e: PointerEvent): void => {
    const ids = host.visualOpenIds();
    const i = ids.indexOf(id);
    const nextId = i >= 0 ? ids[i + 1] : undefined;
    if (nextId === undefined) return;

    // Seed EVERY open panel, not just the two being dragged. Panels left on
    // automatic sizing would otherwise re-flow to absorb the delta, and the boundary
    // the user grabbed would appear not to move.
    const seeded: Record<string, number> = { ...host.sizes() };
    for (const pid of ids) {
      const el = host.elementOf(pid);
      if (el === undefined) continue;
      const r = el.getBoundingClientRect();
      seeded[pid] = host.axis() === 'x' ? r.width : r.height;
    }

    const startA = seeded[id];
    const startB = seeded[nextId];
    if (startA === undefined || startB === undefined) return;

    const startPointer = host.axis() === 'x' ? e.clientX : e.clientY;
    const minA = host.minSizeOf(id);
    const minB = host.minSizeOf(nextId);

    host.setSizes(seeded);
    setResizing(true);

    const target = e.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      const now = host.axis() === 'x' ? ev.clientX : ev.clientY;
      const raw = (now - startPointer) * host.direction();
      if (Math.abs(raw) < RESIZE_ACTIVATE_PX) return;
      // Clamp against BOTH floors before applying, so the pair always sums to the
      // same total — clamping after the fact is what produces the classic
      // "the other panel keeps shrinking past its minimum" bug.
      const delta = Math.max(minA - startA, Math.min(raw, startB - minB));
      host.setSizes({ ...host.sizes(), [id]: startA + delta, [nextId]: startB - delta });
    };

    const onUp = (ev: PointerEvent): void => {
      target?.releasePointerCapture?.(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setResizing(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
    e.stopPropagation();
  };

  return { begin, resizing };
}
