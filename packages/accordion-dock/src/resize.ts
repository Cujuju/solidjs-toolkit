import { createSignal, onCleanup, type Accessor } from 'solid-js';
import { createCancelListeners } from './gesture';

/**
 * Splitter drag engine. A drag moves the boundary between two adjacent open panels, so the
 * group's total never changes. See DESIGN_NOTES.md § src/resize.ts:4.
 */

/**
 * Fallback floor when a panel declares no `minSize`. Small enough for a narrow column, large
 * enough that a panel can never be dragged to zero and become impossible to grab.
 */
export const DEFAULT_MIN_SIZE_PX = 60;

/**
 * How far PAST the minimum the pointer must travel before a drag reads as "collapse this".
 * A 1px trigger would collapse a clamped panel on any firm drag.
 */
const COLLAPSE_OVERDRAG_PX = 40;

/** Primary pointer button. A secondary press opens the platform context menu, which
 *  consumes the release, so it must never arm a drag. */
const PRIMARY_BUTTON = 0;

/**
 * How far one arrow keypress moves the boundary, px. 8px is deliberately fine: a splitter is
 * a precision control, and holding the key (autorepeat) covers distance.
 */
const KEYBOARD_STEP_PX = 8;

/** The coarse step, on Shift+arrow. Ten notches of the fine one, and a round multiple so the
 *  two compose predictably. */
const KEYBOARD_COARSE_STEP_PX = KEYBOARD_STEP_PX * 10;

/**
 * The flex declaration for ONE open member — panels and leaves alike. In `fill`, a declared
 * `grow` absorbs the remainder. See DESIGN_NOTES.md § src/resize.ts:76.
 */
export function columnFlex(opts: {
  /** The panel's explicit size, or `undefined` while it follows the mode. */
  sizePx: number | undefined;
  /** `fill` mode — the only mode that owes the group's whole extent to its members. */
  fill: boolean;
  /** True when no open member follows this one in visual order. */
  trailing: boolean;
  /** This member declares itself the absorber of the group's leftover space. */
  declaresGrow: boolean;
  /** Any OPEN member declares it — which retires the trailing default, including for members
   *  that declare nothing. */
  groupHasDeclaredGrower: boolean;
  /** This member is its CONTENT's size, with `sizePx` as a ceiling it scrolls past. */
  shrinkToContent: boolean;
  /** The group's growth axis, so a ceiling is applied to the dimension the dock
   *  actually sizes along. */
  axis: 'width' | 'height';
}): { flex: string; maxWidth?: string; maxHeight?: string } | Record<string, never> {
  if (opts.shrinkToContent) {
    // `0 1 auto`: never grow past the content, shrink if the group cannot hold every member,
    // and take the content as the basis.
    const flex = { flex: '0 1 auto' };
    if (opts.sizePx === undefined) return flex;
    return opts.axis === 'width'
      ? { ...flex, maxWidth: `${opts.sizePx}px` }
      : { ...flex, maxHeight: `${opts.sizePx}px` };
  }

  const grows =
    opts.fill && (opts.declaresGrow || (!opts.groupHasDeclaredGrower && opts.trailing));

  if (opts.sizePx === undefined) {
    /* No explicit size. `fill`'s stylesheet rule is `flex: 1 1 0`, so an unsized NON-grower
           would compete for the surplus — a group with a declared grower pins its others. */
    if (opts.fill && opts.groupHasDeclaredGrower && !opts.declaresGrow) {
      return { flex: '0 0 auto' };
    }
    return {};
  }
  return { flex: grows ? `1 1 ${opts.sizePx}px` : `0 0 ${opts.sizePx}px` };
}

export interface ResizeHost {
  /** Growth axis: 'x' for horizontal columns, 'y' for vertical fill panels. */
  axis: Accessor<'x' | 'y'>;
  /** +1 when pointer-forward grows the dragged panel, -1 when the axis is mirrored (rail docked
   *  right, so columns grow leftward). */
  direction: Accessor<1 | -1>;
  /** Every open panel in visual sequence — the set a drag is allowed to redistribute
   *  between. */
  visualOpenIds: Accessor<readonly string[]>;
  elementOf: (id: string) => HTMLElement | undefined;
  minSizeOf: (id: string) => number;
  sizes: Accessor<Readonly<Record<string, number>>>;
  /** Intermediate sizes DURING a gesture. Updates the signal and nothing else — no
   *  persistence, no consumer callback. See the header. */
  previewSizes: (next: Record<string, number>) => void;
  /** The sizes a gesture SETTLED on. Persisted and reported. */
  commitSizes: (next: Record<string, number>) => void;
  /** Close a panel dragged past its minimum. Returns false when it refuses, in which case the
   *  drag just clamps. */
  collapse: (id: string) => boolean;
  /** Whether `id` may be collapsed by overdrag at all. */
  canCollapse: (id: string) => boolean;
}

/** The pair a splitter redistributes between, with the seeded sizes and the floors
 *  that constrain them. */
interface ResizePair {
  nextId: string;
  seeded: Record<string, number>;
  startA: number;
  startB: number;
  minA: number;
  minB: number;
}

export interface ResizeApi {
  begin: (id: string, e: PointerEvent) => void;
  /**
   * Move the boundary on `id`'s trailing edge — the KEYBOARD path, through the same clamped
   * arithmetic. See DESIGN_NOTES.md § src/resize.ts:237.
   */
  nudge: (id: string, steps: number, coarse: boolean) => void;
  /** Current extent and travel limits for the panel on `id`'s leading side, for the separator's
   *  `aria-value*`. Undefined when there is no pair. */
  boundsOf: (id: string) => { value: number; min: number; max: number } | undefined;
  resizing: Accessor<boolean>;
  /** The panel that will collapse if the pointer is released now. Drives the pre-commit
   *  affordance — collapsing with no warning feels like a lost panel. */
  collapseCandidate: Accessor<string | null>;
}

export function createResize(host: ResizeHost): ResizeApi {
  const [resizing, setResizing] = createSignal(false);
  const [collapseCandidate, setCollapseCandidate] = createSignal<string | null>(null);

  /**
   * Teardown for the drag in flight, held here so the owner's disposal can run it. Otherwise a
   * group unmounted mid-drag leaves `pointermove` bound to a dead graph.
   */
  let endActiveDrag: (() => void) | null = null;
  onCleanup(() => endActiveDrag?.());

  /**
   * Every open panel's current extent, measured. EVERY panel, because ones left on automatic
   * sizing would re-flow to absorb the delta and the grabbed boundary would not appear to move.
   */
  const seedSizes = (ids: readonly string[]): Record<string, number> => {
    const seeded: Record<string, number> = { ...host.sizes() };
    for (const pid of ids) {
      const el = host.elementOf(pid);
      if (el === undefined) continue;
      const r = el.getBoundingClientRect();
      seeded[pid] = host.axis() === 'x' ? r.width : r.height;
    }
    return seeded;
  };

  const pairFor = (id: string): ResizePair | null => {
    const ids = host.visualOpenIds();
    const i = ids.indexOf(id);
    const nextId = i >= 0 ? ids[i + 1] : undefined;
    if (nextId === undefined) return null;

    const seeded = seedSizes(ids);
    const startA = seeded[id];
    const startB = seeded[nextId];
    if (startA === undefined || startB === undefined) return null;

    return {
      nextId,
      seeded,
      startA,
      startB,
      minA: host.minSizeOf(id),
      minB: host.minSizeOf(nextId),
    };
  };

  /**
   * Clamp a requested movement against BOTH floors before applying it. Clamping after the fact
   * is what produces "the other panel keeps shrinking past its minimum".
   */
  const clampDelta = (raw: number, p: ResizePair): number =>
    Math.max(p.minA - p.startA, Math.min(raw, p.startB - p.minB));

  const begin = (id: string, e: PointerEvent): void => {
    // One drag at a time: a second press would overwrite `endActiveDrag` and orphan the first.
    if (e.button !== PRIMARY_BUTTON || endActiveDrag !== null) return;
    const p = pairFor(id);
    if (p === null) return;

    const startPointer = host.axis() === 'x' ? e.clientX : e.clientY;
    // Only the pressing pointer drives the drag; capture does not stop other touches reaching `window`.
    const pointerId = e.pointerId;
    const sizesBefore = host.sizes();

    host.previewSizes(p.seeded);
    setResizing(true);

    const target = e.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return;
      const now = host.axis() === 'x' ? ev.clientX : ev.clientY;
      /*
                   * Applied from the first pixel — deliberately no activation threshold.
                   * See DESIGN_NOTES.md § src/resize.ts:348.
                   */
      const raw = (now - startPointer) * host.direction();
      const delta = clampDelta(raw, p);
      host.previewSizes({ ...host.sizes(), [id]: p.startA + delta, [p.nextId]: p.startB - delta });

      // Overdrag → collapse, measured against the UNCLAMPED movement: once a panel is pinned at
      // its minimum the clamped size stops changing. Committed on release, not here.
      const wantA = p.startA + raw;
      const wantB = p.startB - raw;
      if (wantA < p.minA - COLLAPSE_OVERDRAG_PX && host.canCollapse(id)) {
        setCollapseCandidate(id);
      } else if (wantB < p.minB - COLLAPSE_OVERDRAG_PX && host.canCollapse(p.nextId)) {
        setCollapseCandidate(p.nextId);
      } else {
        setCollapseCandidate(null);
      }
    };

    const detach = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      cancel.remove();
      endActiveDrag = null;
      setCollapseCandidate(null);
      setResizing(false);
    };

    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return;
      target?.releasePointerCapture?.(ev.pointerId);
      const victim = collapseCandidate();
      detach();

      // THE commit: one persisted state and one notification for the whole gesture.
      const settled = { ...host.sizes() };
      if (victim !== null) {
        host.collapse(victim);
        // Drop the collapsed panel's explicit size: it reopens at the mode's automatic size, not
        // the 1px sliver it was squashed to.
        delete settled[victim];
      }
      host.commitSizes(settled);
    };

    // Abandoned, not released: restore the pre-drag sizes and commit nothing.
    const abandon = (): void => {
      target?.releasePointerCapture?.(pointerId);
      detach();
      host.previewSizes(sizesBefore);
    };
    const onPointerCancel = (ev: PointerEvent): void => {
      if (ev.pointerId === pointerId) abandon();
    };
    // Esc / window blur / contextmenu: no release will arrive.
    const cancel = createCancelListeners({ onCancel: abandon });
    cancel.add();

    endActiveDrag = detach;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onPointerCancel);
    e.preventDefault();
    e.stopPropagation();
  };

  const nudge = (id: string, steps: number, coarse: boolean): void => {
    const p = pairFor(id);
    if (p === null) return;
    const step = coarse ? KEYBOARD_COARSE_STEP_PX : KEYBOARD_STEP_PX;
    const delta = clampDelta(steps * step * host.direction(), p);
    if (delta === 0) return;
    // Straight to commit: a keypress is already a discrete decision, so there is no intermediate
    // state worth previewing.
    host.commitSizes({ ...p.seeded, [id]: p.startA + delta, [p.nextId]: p.startB - delta });
  };

  const boundsOf = (id: string): { value: number; min: number; max: number } | undefined => {
    const p = pairFor(id);
    if (p === null) return undefined;
    // The pair's total is fixed, so this panel's ceiling is whatever its neighbour can give up —
    // the same bound `clampDelta` enforces.
    return {
      value: Math.round(p.startA),
      min: Math.round(p.minA),
      max: Math.round(p.startA + (p.startB - p.minB)),
    };
  };

  return { begin, nudge, boundsOf, resizing, collapseCandidate };
}
