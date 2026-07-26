import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Splitter drag engine.
 *
 * The model is deliberately CONSERVATIVE: a drag moves the boundary between exactly
 * two adjacent open panels, adding to one and taking the same amount from the other.
 * The group's total extent never changes, so a resize cannot make the dock overflow
 * its container or leave a gap — the two failure modes of the naive "just set this
 * panel's width" approach.
 *
 * Sizes are seeded from the DOM at gesture start rather than tracked continuously:
 * before the first drag every panel is sized by the mode (`fill` splits evenly,
 * `natural` uses a token width), and those computed sizes are exactly what the user
 * sees and expects to start dragging FROM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREVIEW vs COMMIT — a gesture is ONE decision, not sixty.
 *
 * A pointermove is not a decision the user made; releasing the pointer is. The
 * engine therefore writes intermediate sizes through `previewSizes` (signal only)
 * and the settled one through `commitSizes` (persisted, and reported to the
 * consumer). Everything the user sees during a drag comes from the preview, so the
 * feel is identical.
 *
 * It used to call one setter for both, which meant a `JSON.stringify` plus a
 * synchronous `localStorage.setItem` on EVERY pointermove — a write per frame for
 * the whole gesture, of which exactly one was worth keeping — and one
 * `onSizeChange` per frame for a consumer that almost certainly wanted the result.
 * The intermediate values are not merely wasteful to store, they are wrong to
 * store: a drag interrupted by a crash would persist whatever pixel the pointer
 * happened to be over, and a consumer mirroring the callback would record sixty
 * layout revisions for one adjustment.
 */

/**
 * Fallback floor when a panel declares no `minSize`. Small enough to allow a very
 * narrow column, large enough that a panel can never be dragged to zero and become
 * impossible to grab again.
 */
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

/**
 * How much one arrow keypress moves the boundary, px.
 *
 * The keyboard equivalent of a drag has to answer a question the pointer never
 * asks: how far is "a bit"? 8px is deliberately fine rather than convenient — a
 * splitter is a precision control, and a user who wants to travel a long way holds
 * the key (autorepeat makes that fast) or uses the coarse step below. Erring coarse
 * would make fine adjustment impossible; erring fine only makes the long adjustment
 * slower, which is the cheaper mistake.
 */
const KEYBOARD_STEP_PX = 8;

/** The coarse step, on Shift+arrow. Ten notches of the fine one — enough that
 *  crossing a wide dock is a few presses, and a round multiple so the two steps
 *  compose predictably. */
const KEYBOARD_COARSE_STEP_PX = KEYBOARD_STEP_PX * 10;

/**
 * The flex declaration for ONE open member, given its explicit size (if any).
 *
 * ONE definition for both `<AccordionPanel>` and `<AccordionLeaf>`: the leaf is a
 * first-class member for sizing, so two copies of this rule would be two places to
 * forget the surplus case below — which is exactly how the dead gap got shipped.
 *
 * ── The surplus has to go somewhere ─────────────────────────────────────────
 * `fill` mode means "the dock has this extent and divides ALL of it". An explicit
 * size (from a splitter drag, a `defaultSize`, or a persisted layout) turns a
 * member into `flex: 0 0 Npx`, and once EVERY open member is explicitly sized
 * nothing is left to absorb the remainder — the group paints a dead strip at its
 * trailing edge and the mode has quietly stopped meaning what it says.
 *
 * ── Who absorbs it: DECLARED first, trailing by default ─────────────────────
 * Which member *should* take the surplus is a question about the CONTENT, and only
 * the CONSUMER can answer it. Resist the temptation to infer it from a member's
 * role — "the list grows, the detail pane is bounded" is the obvious-sounding rule
 * and it is wrong. A detail pane is not reliably short: a symbol's strategies run
 * one card per expiration and every card carries its legs, so the pane is often
 * the TALLER of the two. Neither kind of member is dependably bounded, which is
 * exactly why this is a declaration (`grow`) and not a heuristic.
 *
 * The DEFAULT, when nobody declares, stays the trailing member. That was once
 * justified as the rule rather than a fallback, on the grounds that the trailing
 * member is the one whose size the user cannot drag directly — splitters sit on a
 * member's edge FACING THE NEXT one, so the last has no handle of its own and any
 * size it carries is a leftover of resizing its neighbours, never a size the user
 * asked for. That reasoning is still true, and it is still why trailing is a SAFE
 * default. It is not a reason to think trailing is the RIGHT recipient: it was
 * chosen for a horizontal dock where the trailing column was the surface — the
 * thing that wanted all the room — and the same rule rotated into a vertical
 * sidebar hands the surplus to the detail pane, which is precisely the member that
 * cannot use it.
 *
 * TWO OR MORE DECLARED GROWERS SHARE the remainder. Each keeps its own size as its
 * basis and they take equal `flex-grow`, so the SURPLUS is split evenly between
 * them while their starting sizes stay different — not a 50/50 split of the group.
 * This is a first-class configuration, not a tolerated mistake: when two sections
 * both hold content of unpredictable length, "share what is left and let each
 * scroll past its share" is the honest answer, and picking a winner would starve
 * whichever one the consumer did not name.
 *
 * The stored px stays as the flex BASIS rather than being discarded, so a growing
 * member still starts from its remembered size when the group is too small to
 * grant the remainder, and shrinks from there like any other.
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
  /** Any OPEN member of the group declares it — which retires the trailing
   *  default, including for members that declare nothing. */
  groupHasDeclaredGrower: boolean;
}): { flex: string } | Record<string, never> {
  const grows =
    opts.fill && (opts.declaresGrow || (!opts.groupHasDeclaredGrower && opts.trailing));

  if (opts.sizePx === undefined) {
    /* No explicit size. Normally the stylesheet's mode rules size this member and
       an inline `flex` here would out-specify them for no gain — but `fill`'s
       stylesheet rule is `flex: 1 1 0`, i.e. "grow", which would let an unsized
       NON-grower compete with the declared one for the surplus. So a group with a
       declared grower pins its other members to their content size; without one,
       nothing is emitted and behaviour is exactly what it always was. */
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
  /** +1 when pointer-forward grows the dragged panel, -1 when the axis is mirrored
   *  (rail docked right, so columns grow leftward). */
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
  /** Close a panel that was dragged past its minimum. Returns false when the panel
   *  refuses (a leaf, or a consumer-controlled pane), in which case the drag just
   *  clamps as usual. */
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
   * Move the boundary on `id`'s trailing edge by `steps` — the KEYBOARD path.
   *
   * Not an accessibility afterthought bolted beside the drag: it redistributes
   * through the same clamped arithmetic, so the floors, the mirrored axis and the
   * "the pair always sums to the same total" invariant hold identically. A second
   * implementation of that arithmetic is how the two paths come to disagree about
   * what a minimum means.
   *
   * `steps` is signed the way a pointer would move. Collapse is deliberately NOT
   * reachable this way: overdrag is a gesture with a distance, and a keypress has
   * none, so a key can clamp at the minimum but never close a panel out from under
   * the user.
   */
  nudge: (id: string, steps: number, coarse: boolean) => void;
  /** Current extent and travel limits for the panel on `id`'s leading side, for the
   *  separator's `aria-value*`. Undefined when there is no pair to resize. */
  boundsOf: (id: string) => { value: number; min: number; max: number } | undefined;
  resizing: Accessor<boolean>;
  /** The panel that will collapse if the pointer is released now, or null. Drives the
   *  pre-commit affordance — collapsing on release with no warning would feel like
   *  the control lost the panel. */
  collapseCandidate: Accessor<string | null>;
}

export function createResize(host: ResizeHost): ResizeApi {
  const [resizing, setResizing] = createSignal(false);
  const [collapseCandidate, setCollapseCandidate] = createSignal<string | null>(null);

  /**
   * Teardown for the drag currently in flight, or null.
   *
   * Held at this level so the owning component's disposal can run it. Without that,
   * a group unmounted mid-drag (a route change while the pointer is down, an HMR
   * boundary) leaves `pointermove` and `pointerup` bound to `window` forever, each
   * closing over a dead reactive graph — and every subsequent move writes sizes
   * into a disposed signal.
   */
  let endActiveDrag: (() => void) | null = null;
  onCleanup(() => endActiveDrag?.());

  /**
   * Every open panel's current extent, measured.
   *
   * EVERY panel, not just the two a gesture touches: panels left on automatic
   * sizing would otherwise re-flow to absorb the delta, and the boundary the user
   * grabbed would appear not to move. Shared by both entry points, so the pointer
   * and the keyboard start from the same numbers.
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
   * Clamp a requested movement against BOTH floors before applying it.
   *
   * Clamping after the fact is what produces the classic "the other panel keeps
   * shrinking past its minimum" bug: the pair must always sum to the same total, so
   * the delta is bounded by what each side can give.
   */
  const clampDelta = (raw: number, p: ResizePair): number =>
    Math.max(p.minA - p.startA, Math.min(raw, p.startB - p.minB));

  const begin = (id: string, e: PointerEvent): void => {
    const p = pairFor(id);
    if (p === null) return;

    const startPointer = host.axis() === 'x' ? e.clientX : e.clientY;

    host.previewSizes(p.seeded);
    setResizing(true);

    const target = e.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      const now = host.axis() === 'x' ? ev.clientX : ev.clientY;
      /*
       * Applied from the first pixel — there is deliberately no activation
       * threshold.
       *
       * There used to be a constant for one, set to 0, guarded by
       * `Math.abs(raw) < 0` (never true) and commented as matching the reorder
       * primitive's activation distance. It matched nothing and did nothing. A
       * dead constant claiming to encode a decision is worse than no constant:
       * the next reader either trusts a threshold that is not there, or "fixes"
       * the value and silently changes behaviour nothing tested.
       *
       * The threshold is genuinely not wanted here. It exists in a reorder drag
       * to tell a click from a drag on an element that does BOTH. A splitter is a
       * dedicated handle with no click action, so a press that moves 2px means
       * "move the boundary 2px" and nothing else.
       */
      const raw = (now - startPointer) * host.direction();
      const delta = clampDelta(raw, p);
      host.previewSizes({ ...host.sizes(), [id]: p.startA + delta, [p.nextId]: p.startB - delta });

      // Overdrag → collapse. Measured against the UNCLAMPED movement, because once a
      // panel is pinned at its minimum the clamped size stops changing and could
      // never express "keep going". Committed on release, not here: collapsing
      // mid-drag would yank the boundary out from under the pointer.
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
      window.removeEventListener('pointercancel', onUp);
      endActiveDrag = null;
      setCollapseCandidate(null);
      setResizing(false);
    };

    const onUp = (ev: PointerEvent): void => {
      target?.releasePointerCapture?.(ev.pointerId);
      const victim = collapseCandidate();
      detach();

      // THE commit: one persisted state and one notification for the whole gesture.
      const settled = { ...host.sizes() };
      if (victim !== null) {
        host.collapse(victim);
        // Drop the collapsed panel's explicit size: it will be reopened later at the
        // mode's automatic size, which is what the user expects from a panel they
        // deliberately squashed away — not the 1px sliver they squashed it to.
        delete settled[victim];
      }
      host.commitSizes(settled);
    };

    endActiveDrag = detach;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
    e.stopPropagation();
  };

  const nudge = (id: string, steps: number, coarse: boolean): void => {
    const p = pairFor(id);
    if (p === null) return;
    const step = coarse ? KEYBOARD_COARSE_STEP_PX : KEYBOARD_STEP_PX;
    const delta = clampDelta(steps * step * host.direction(), p);
    if (delta === 0) return;
    // Straight to commit: a keypress is already a discrete decision, so there is no
    // intermediate state worth previewing.
    host.commitSizes({ ...p.seeded, [id]: p.startA + delta, [p.nextId]: p.startB - delta });
  };

  const boundsOf = (id: string): { value: number; min: number; max: number } | undefined => {
    const p = pairFor(id);
    if (p === null) return undefined;
    // The pair's total is fixed, so this panel's ceiling is whatever its neighbour
    // can give up — the same bound `clampDelta` enforces, read out rather than
    // recomputed.
    return {
      value: Math.round(p.startA),
      min: Math.round(p.minA),
      max: Math.round(p.startA + (p.startB - p.minB)),
    };
  };

  return { begin, nudge, boundsOf, resizing, collapseCandidate };
}
