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

/**
 * How far PAST a panel's minimum the pointer must travel before the drag is read as
 * "collapse this" rather than "make it as small as allowed".
 *
 * It has to be a deliberate overshoot, not a hair past the floor: a panel already
 * clamped at its minimum sits under a pointer that is still moving, so a 1px trigger
 * would collapse panels every time someone dragged firmly to the edge. Wide enough
 * to require intent, short enough to discover by accident once.
 */
const COLLAPSE_OVERDRAG_PX = 40;

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
  /** Close a panel that was dragged past its minimum. Returns false when the panel
   *  refuses (a leaf, or a consumer-controlled pane), in which case the drag just
   *  clamps as usual. */
  collapse: (id: string) => boolean;
  /** Whether `id` may be collapsed by overdrag at all. */
  canCollapse: (id: string) => boolean;
}

export interface ResizeApi {
  begin: (id: string, e: PointerEvent) => void;
  resizing: Accessor<boolean>;
  /** The panel that will collapse if the pointer is released now, or null. Drives the
   *  pre-commit affordance — collapsing on release with no warning would feel like
   *  the control lost the panel. */
  collapseCandidate: Accessor<string | null>;
}

export function createResize(host: ResizeHost): ResizeApi {
  const [resizing, setResizing] = createSignal(false);
  const [collapseCandidate, setCollapseCandidate] = createSignal<string | null>(null);

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

      // Overdrag → collapse. Measured against the UNCLAMPED movement, because once a
      // panel is pinned at its minimum the clamped size stops changing and could
      // never express "keep going". Committed on release, not here: collapsing
      // mid-drag would yank the boundary out from under the pointer.
      const wantA = startA + raw;
      const wantB = startB - raw;
      if (wantA < minA - COLLAPSE_OVERDRAG_PX && host.canCollapse(id)) {
        setCollapseCandidate(id);
      } else if (wantB < minB - COLLAPSE_OVERDRAG_PX && host.canCollapse(nextId)) {
        setCollapseCandidate(nextId);
      } else {
        setCollapseCandidate(null);
      }
    };

    const onUp = (ev: PointerEvent): void => {
      target?.releasePointerCapture?.(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const victim = collapseCandidate();
      if (victim !== null) {
        host.collapse(victim);
        // Drop the collapsed panel's explicit size: it will be reopened later at the
        // mode's automatic size, which is what the user expects from a panel they
        // deliberately squashed away — not the 1px sliver they squashed it to.
        const next = { ...host.sizes() };
        delete next[victim];
        host.setSizes(next);
      }
      setCollapseCandidate(null);
      setResizing(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
    e.stopPropagation();
  };

  return { begin, resizing, collapseCandidate };
}
