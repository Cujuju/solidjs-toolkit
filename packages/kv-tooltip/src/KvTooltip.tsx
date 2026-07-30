import {
  createSignal,
  createMemo,
  createEffect,
  createUniqueId,
  on,
  onCleanup,
  For,
  Show,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  createClampedPosition,
  ensureViewportListeners,
  viewportScrollTick,
  DEFAULT_ANCHOR_GAP_PX,
  type KvTooltipPlacement,
} from './clamp';
import { createHoverIntent } from './_internal/hoverIntent';
import { isTopLayerSurfaceOpen } from './_internal/topLayer';

/**
 * An anchor is either a rect captured by the caller, or an accessor that
 * re-measures on demand. Prefer the accessor form: the position recomputes on
 * viewport resize and on any scroll (see `clamp.ts`), and only the accessor
 * form can return a fresh rect at that moment. A bare `DOMRect` is a snapshot
 * and will go stale if the anchor element moves.
 */
export type KvTooltipAnchor = DOMRect | (() => DOMRect | null);

/** Resolve either anchor form to a rect (or `null` when unset / unmounted). */
function resolveAnchor(anchor: KvTooltipAnchor | undefined): DOMRect | null {
  if (anchor === undefined) return null;
  return typeof anchor === 'function' ? anchor() : anchor;
}

/**
 * Anchored-placement props. Shared by the hover wrapper and the controlled
 * panel — one declaration so the two entry points can never drift apart on
 * what anchoring means.
 *
 * Why anchoring exists at all: a panel placed at a cursor POINT can only be
 * kept clear of a surface that opens from the same trigger by luck. Anchoring
 * to the trigger's RECT lets the tooltip take one side (say, above) while a
 * menu takes the other (below), so neither can cover the other. That matters
 * specifically because the native Popover API paints in the browser TOP LAYER:
 * this Portal-rendered panel is normal stacking content and can never paint
 * above an open popover at any z-index. Placement, not z-index, is the fix.
 */
export interface KvTooltipAnchoringProps {
  /**
   * Anchor the panel to a rect instead of to `x`/`y`. When supplied, `x`/`y`
   * are ignored and `hysteresisPx` is bypassed (a static rect cannot flicker).
   * Prefer the accessor form so the rect is re-read on resize / scroll.
   */
  anchor?: KvTooltipAnchor;
  /**
   * Which side of the `anchor` the panel takes, and how it aligns along that
   * side. Default `'cursor'` = the 0.1.0 mouse-follow behaviour. Supplying an
   * `anchor` while leaving this at `'cursor'` resolves to `'below-start'`.
   * Overflow flips to the opposite side of the RECT — never onto it.
   */
  placement?: KvTooltipPlacement;
  /**
   * Gap between the anchor's edge and the panel's facing edge. Default 4,
   * matching `DEFAULT_POPOVER_OFFSET_PX` in `@cujuju/solidjs-anchored-popover`
   * so a tooltip and a popover on the same trigger share one offset grid.
   */
  anchorGapPx?: number;
}

// ── Filter helper ──────────────────────────────────────────────────────────
function filterEntries(
  entries: Record<string, string>,
  showEmpty: boolean,
): Array<[string, string]> {
  return Object.entries(entries).filter(([, v]) =>
    showEmpty ? true : v !== '' && v !== undefined,
  );
}

// ── Shared tooltip panel (internal) ─────────────────────────────────────────
interface TooltipContentProps extends KvTooltipAnchoringProps {
  entries: Array<[string, string]>;
  x: number;
  y: number;
  extraContent?: JSX.Element;
  hysteresisPx: number;
  edgePadPx: number;
  mouseOffsetX: number;
  mouseOffsetY: number;
  minWidth?: number | string;
  maxWidth?: number | string;
  interactive: boolean;
  role: 'tooltip' | 'status';
  ariaLabel?: string;
  /**
   * Hide the panel from assistive tech. Set when the wrapper is already
   * exposing the same text through its always-mounted description node — two
   * copies of one tooltip is worse than one, and the hidden node is the copy
   * that survives when the pointer is not involved.
   */
  ariaHidden?: boolean;
  panelClass?: string;
  portalTarget?: HTMLElement;
  /**
   * Optional handlers wired onto the panel's outer div. KvTooltip wrapper
   * uses these to participate in the hover-intent state machine (cancel
   * pending hide on enter, re-arm on leave). KvTooltipPanel (controlled
   * mode) omits them — consumer owns visibility.
   *
   * Safe to attach unconditionally: when `interactive=false` the panel has
   * `pointer-events: none` (per styles.css), so these listeners attach but
   * never fire.
   */
  onPanelMouseEnter?: () => void;
  onPanelMouseLeave?: () => void;
}

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

/**
 * `left` used while measuring. A `position: fixed` element's containing block
 * is the viewport, so its shrink-to-fit width is capped at `viewport - left`;
 * flushing it to the origin is what makes the measurement independent of
 * wherever the panel currently sits.
 */
const MEASURE_ORIGIN_LEFT = '0px';

/**
 * Measure the panel at its NATURAL size — the size it would take with the
 * whole viewport available — rather than at whatever size its current `left`
 * happens to allow.
 *
 * Why this is not paranoia: measuring in place is a feedback loop. The panel
 * is `position: fixed`, so at `left: L` its available width is `viewport - L`;
 * a shrink-to-fit panel near the right edge therefore measures NARROWER than
 * it is, and (because the content rewraps) TALLER. That wrong width feeds the
 * clamp, which picks a new `left`, which changes the available width again.
 * Observed 2026-07-23 in the playground: a panel whose natural box is 260x84
 * measured 228x102 in place and settled flush against the viewport edge with
 * zero `edgePadPx` clearance. The corrupted HEIGHT is the worse half — it is
 * the entire basis of the above/below flip decision in anchored mode.
 *
 * Reading `offsetWidth` forces a synchronous layout but no paint, and Solid
 * effects run before the browser paints, so the temporary `left` is never
 * visible. The write is restored immediately; Solid's style binding re-applies
 * the real value on the update that `setSize` triggers anyway.
 */
function measureNaturalSize(el: HTMLElement): { w: number; h: number } {
  const previousLeft = el.style.left;
  el.style.left = MEASURE_ORIGIN_LEFT;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = previousLeft;
  return { w, h };
}

function TooltipContent(props: TooltipContentProps): JSX.Element {
  let ref: HTMLDivElement | undefined;
  const [measured, setMeasured] = createSignal(false);
  const [size, setSize] = createSignal({ w: 0, h: 0 });

  // Measure after mount to avoid first-frame position jump
  createEffect(() => {
    const _len = props.entries.length; // track for re-measure
    void _len;
    void props.extraContent; // re-measure when extra content changes
    if (ref) {
      setSize(measureNaturalSize(ref));
      setMeasured(true);
    }
  });

  const pos = createClampedPosition({
    getX: () => props.x,
    getY: () => props.y,
    getW: () => size().w || 150,
    getH: () => size().h || 100,
    hysteresisPx: props.hysteresisPx,
    edgePadPx: props.edgePadPx,
    mouseOffsetX: props.mouseOffsetX,
    mouseOffsetY: props.mouseOffsetY,
    getAnchorRect: () => resolveAnchor(props.anchor),
    getPlacement: () => props.placement ?? 'cursor',
    getAnchorGapPx: () => props.anchorGapPx ?? DEFAULT_ANCHOR_GAP_PX,
  });

  const panelStyle = (): JSX.CSSProperties => ({
    top: `${pos().y}px`,
    left: `${pos().x}px`,
    opacity: measured() ? 1 : 0,
    ...(props.minWidth !== undefined ? { 'min-width': toCssSize(props.minWidth) } : {}),
    ...(props.maxWidth !== undefined ? { 'max-width': toCssSize(props.maxWidth) } : {}),
  });

  return (
    <Portal mount={props.portalTarget ?? document.body}>
      <div
        ref={ref}
        class={`ckv-panel ${props.panelClass ?? ''}`.trim()}
        role={props.role}
        aria-label={props.ariaLabel}
        aria-hidden={props.ariaHidden ? 'true' : undefined}
        data-interactive={props.interactive ? 'true' : undefined}
        style={panelStyle()}
        onMouseEnter={props.onPanelMouseEnter}
        onMouseLeave={props.onPanelMouseLeave}
      >
        <For each={props.entries}>
          {([key, value]) => (
            <div class="ckv-row">
              <span class="ckv-key">{key}:</span>
              <span class="ckv-value">{value}</span>
            </div>
          )}
        </For>
        <Show when={props.extraContent}>
          <div class="ckv-extra">{props.extraContent}</div>
        </Show>
      </div>
    </Portal>
  );
}

// ── Wrapper mode: hover-triggered ──────────────────────────────────────────
export interface KvTooltipProps extends KvTooltipAnchoringProps {
  entries: Record<string, string>;
  children: JSX.Element;

  extraContent?: JSX.Element;

  showEmpty?: boolean;
  disabled?: boolean;
  mouseOffsetX?: number;
  mouseOffsetY?: number;
  hysteresisPx?: number;
  edgePadPx?: number;
  interactive?: boolean;

  minWidth?: number | string;
  maxWidth?: number | string;

  /**
   * Hide-debounce delay (ms) used in interactive mode. After the cursor
   * leaves the trigger (or the panel), the panel persists this long so the
   * user can cross the gap between trigger and panel without losing it.
   * Cancelled by re-entering either the trigger or the panel.
   *
   * Default 100ms — derived from typical pointer-travel time across the
   * `mouseOffsetX/Y` gap (12-16px at 60-120 px/s mouse speeds = 100-250ms).
   * Both wrapper and panel cancel on enter, so 100ms catches a slow user
   * who paused mid-traversal. Below 50ms feels too fast; above 200ms feels
   * sluggish.
   *
   * Only consulted when `interactive=true`. Non-interactive callers hide
   * immediately on mouseleave (preserved behavior).
   */
  hideDelayMs?: number;

  /**
   * Rest delay (ms) on the way IN: the panel appears only after the pointer
   * has stayed on the trigger this long, so a pointer passing THROUGH a dense
   * row of triggers never flashes a tooltip behind it. Cancelled by leaving
   * the trigger.
   *
   * Default 0 / undefined = show immediately (0.1.x behaviour). There is
   * deliberately no derived default — the right value depends on the
   * consumer's trigger density and size, not on this package's geometry. See
   * the derivation in `_internal/hoverIntent.ts`.
   *
   * Applies in both interactive and non-interactive mode.
   */
  showDelayMs?: number;

  /**
   * Snapshot the panel's content AND its reference position at show time, and
   * hold both until the panel hides.
   *
   * Why: `entries` is read reactively, so a live-ticking source (a streaming
   * quote) re-runs the entries memo on every tick, which re-runs the panel's
   * measure effect, which re-derives the clamped position — the panel visibly
   * re-measures and twitches under a stationary cursor. Consumers were
   * working around this downstream by snapshotting the object before passing
   * it in; that workaround belongs here, where the measure effect actually
   * lives.
   *
   * What is frozen: the filtered entry list, the cursor point, and the
   * resolved anchor rect. What is NOT frozen: `extraContent` (the consumer
   * owns its own reactivity) and the viewport clamp itself — a frozen panel
   * still re-clamps on resize/scroll, it just re-clamps from held inputs, so
   * it cannot drift off-screen while held.
   *
   * Default `false` = 0.1.0 live-follow behaviour.
   */
  freezeOnShow?: boolean;

  /**
   * Pressing the pointer on the trigger hides the panel and suppresses every
   * re-show until the pointer leaves the trigger and comes back.
   *
   * For a trigger that is also a control — a field that opens a select menu,
   * a button that opens a popover — the tooltip has said what it had to say by
   * the time the user commits to clicking, and keeping it up means it competes
   * with whatever the click opened.
   *
   * The suppression (rather than a bare hide) is the load-bearing half: a
   * click that lands before a pending `showDelayMs` elapses would otherwise
   * still let the deferred show fire, painting the tooltip over the surface
   * that just opened.
   *
   * Default `false` = pointerdown is not observed at all (0.1.x behaviour).
   */
  hideOnPointerDown?: boolean;

  /**
   * Refuse to show while any native popover is open in the browser's top
   * layer (`[popover]:popover-open`).
   *
   * `hideOnPointerDown` covers the click that opens a menu; this covers the
   * opens it cannot see — keyboard activation, programmatic opens, a surface
   * opened from elsewhere on the page. The panel is ordinary
   * stacking-context content, so it can never paint above the top layer at
   * any z-index; showing it there produces an invisible or competing tooltip.
   *
   * Default `false`, and deliberately so despite being a bug fix: the check is
   * document-global, so defaulting it on would silently break a KvTooltip
   * rendered INSIDE an open popover or dialog — a legitimate existing usage
   * that would simply stop showing tooltips. Opt in from the surface that
   * actually has the collision.
   */
  suppressWhileTopLayerOpen?: boolean;

  /**
   * Hide the panel when anything on the page scrolls.
   *
   * The panel is `position: fixed` at a point captured on hover, so scrolling
   * a list underneath it strands it mid-air describing a row that has moved
   * on. Scrolling produces no mouseleave, so nothing else dismisses it.
   *
   * This is the *hide* half of the scroll contract. The *recompute* half is
   * unconditional and needs no prop: any position — anchored or cursor —
   * re-derives on scroll, so an `anchor` passed as an accessor tracks its
   * element down the page on its own. Reach for `hideOnScroll` when the
   * content itself goes stale (a row tooltip whose row scrolled away), not
   * merely to keep the geometry honest.
   *
   * Default `false` = 0.1.x behaviour (the panel stays put).
   */
  hideOnScroll?: boolean;

  ariaLabel?: string;
  role?: 'tooltip' | 'status';

  /**
   * The tooltip's text for assistive technology — what a screen-reader user
   * gets instead of the panel.
   *
   * WHY THIS EXISTS. The panel is `<Portal>`-rendered, mounted only while
   * hovered, and nothing references it, so `role="tooltip"` on it announces
   * NOTHING: a tooltip role is only spoken through a `aria-describedby`
   * relationship from the described element. That made this component a
   * strictly-worse replacement for a native `title` for anyone not using a
   * mouse — and a consumer cannot keep BOTH (a native `title` and this
   * component fire two competing popups on the same hover). So the accessible
   * text has to come from here.
   *
   * Absent → derived from `entries` ("key: value" per pair). An
   * `extraContent`-only tooltip has no derivable text (the content is
   * arbitrary JSX this component will not stringify) and MUST pass this
   * explicitly, or it stays mouse-only.
   */
  description?: string;
  /**
   * Opt out of the accessible-description machinery entirely (hidden node,
   * `aria-describedby`, focus/Escape handling): `false` restores the 0.2.x
   * mouse-only behaviour.
   *
   * Default `true`. It is on by default deliberately — an a11y contract that
   * every consumer must remember to opt into is the contract that gets
   * forgotten, which is exactly how this component shipped without one.
   */
  describeTrigger?: boolean;
  /**
   * Whether the wrapper takes `tabindex="0"` so a keyboard user can reach the
   * tooltip.
   *
   * Default: AUTO — the wrapper becomes focusable only when it contains no
   * focusable element of its own. A trigger that is already a button/link/
   * input must not gain a second tab stop wrapping it, and a plain text or
   * icon trigger is unreachable without one. Pass `true`/`false` to force it.
   */
  focusable?: boolean;

  /**
   * How the wrapper element itself lays out.
   *
   * `'text'` (default) is the 0.1.x–0.3.x behaviour: an inline box with
   * `overflow: hidden` + `text-overflow: ellipsis`, which is right for wrapping
   * a run of TEXT and wrong for anything else — wrapping a flex-child button in
   * it makes the wrapper the flex item, re-sizes it as inline content, and
   * clips the child's focus ring.
   *
   * `'control'` is the layout-neutral mode for wrapping an existing element
   * (button, icon, badge): `display: inline-flex`, no overflow rule, so the
   * child keeps its own box and the wrapper adds no clipping. Use it whenever
   * the trigger is a control rather than prose.
   *
   * `'block'` fills the parent's content box (`display: block; width: 100%`).
   * It exists for the one container that CANNOT be wrapped from outside: a
   * table cell. `<span><td>…</td></span>` is not parseable — the HTML parser
   * hoists any non-cell element out of the row — so the tooltip has to live
   * inside the cell. A plain inline wrapper then covers only the text, leaving
   * the cell's padding dead to hover, which is a real loss on a data table. In
   * `'block'` mode the caller moves the cell's own padding onto this wrapper
   * (cell padding to 0, same padding class passed via `class`) and the hover
   * surface becomes the whole cell again.
   *
   * `'contents'` removes the wrapper from layout entirely (`display: contents`)
   * — the child becomes the parent's own flex/grid item, which nothing else can
   * reproduce. The trade-off is that a boxless wrapper cannot host a focus ring
   * or a tab stop, so `focusable` is ignored in this mode and the CHILD must be
   * focusable for the keyboard path to work.
   *
   * Two facts about `'contents'`, verified in Chromium 2026-07-29 rather than
   * assumed, because the mode is useless if either is false:
   *   - hover still works: `mouseenter`/`mouseleave` ARE dispatched to a
   *     boxless ancestor when the pointer enters its child, so the wrapper's
   *     listeners fire exactly as in the other modes;
   *   - the wrapper's own `getBoundingClientRect()` is all zeros. Never derive
   *     an `anchor` from the wrapper element in this mode — anchor to the CHILD,
   *     or stay in cursor placement.
   */
  wrapperLayout?: 'text' | 'control' | 'contents' | 'block';

  class?: string;
  panelClass?: string;
  portalTarget?: HTMLElement;
}

/**
 * Visually hidden, still read by assistive tech. Inline (not a CSS class) on
 * purpose: the description must not become visible text in a consumer that
 * forgot to import the package stylesheet.
 */
const SR_ONLY_STYLE: JSX.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  'white-space': 'nowrap',
  border: '0',
};

/** Elements that already take keyboard focus — see the `focusable` prop. */
const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/**
 * Wrapper box per `wrapperLayout`. `'text'` keeps the historical inline+ellipsis
 * rule; the other two exist so wrapping a control does not reflow or clip it.
 * `position: relative` is deliberately absent from the non-text modes: the panel
 * is `position: fixed` in a Portal, so the wrapper is not its containing block
 * and relative positioning only risks creating a stacking context the consumer
 * did not ask for.
 */
function wrapperStyle(layout: 'text' | 'control' | 'contents' | 'block'): JSX.CSSProperties {
  if (layout === 'contents') return { display: 'contents' };
  if (layout === 'block') return { display: 'block', width: '100%' };
  if (layout === 'control') return { display: 'inline-flex', 'align-items': 'center' };
  return {
    position: 'relative',
    display: 'inline',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
  };
}

/** `key: value` per pair — the fallback accessible text for a KV tooltip. */
function describeEntries(entries: Array<[string, string]>): string {
  return entries.map(([k, v]) => `${k}: ${v}`).join('. ');
}

/** Content + reference position held for the lifetime of one show, per `freezeOnShow`. */
interface FrozenSnapshot {
  entries: Array<[string, string]>;
  x: number;
  y: number;
  anchor: DOMRect | null;
}

export function KvTooltip(props: KvTooltipProps): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  const [mouse, setMouse] = createSignal({ x: 0, y: 0 });

  const filtered = createMemo(() =>
    filterEntries(props.entries, props.showEmpty ?? false),
  );

  const shouldShow = (): boolean => !(props.disabled ?? false) && (filtered().length > 0 || props.extraContent !== undefined);
  const interactive = (): boolean => props.interactive ?? false;
  const hideDelayMs = (): number => props.hideDelayMs ?? 100;
  const showDelayMs = (): number => props.showDelayMs ?? 0;

  /**
   * The panel's POSITION is pinned for the lifetime of a show when either the
   * caller asked (`freezeOnShow`) or the panel is INTERACTIVE.
   *
   * Interactive forces it because a cursor-anchored panel is otherwise
   * unreachable: the panel sits at cursor + `mouseOffsetX/Y`, and Solid
   * propagates DELEGATED events (mousemove among them) out of a `<Portal>` to
   * the logical JSX parent — this wrapper. So moving onto the panel fires the
   * wrapper's `onMouseMove`, which moves the panel to the new cursor position,
   * which moves it out from under the pointer, forever. A panel you are meant
   * to click cannot also be a moving target.
   */
  const positionFrozen = (): boolean => (props.freezeOnShow ?? false) || interactive();
  /** CONTENT freezing stays opt-in — an interactive panel may still want live
   *  values, it just may not move. */
  const contentFrozen = (): boolean => props.freezeOnShow ?? false;

  // `on(visible, …)` runs its callback untracked, so taking the snapshot does
  // NOT subscribe this effect to the very sources it is snapshotting.
  const [frozen, setFrozen] = createSignal<FrozenSnapshot | null>(null);
  createEffect(
    on(visible, (v) => {
      if (!v || !positionFrozen()) {
        setFrozen(null);
        return;
      }
      const m = mouse();
      setFrozen({ entries: filtered(), x: m.x, y: m.y, anchor: resolveAnchor(props.anchor) });
    }),
  );

  // Each of these reads the live source ONLY when nothing is frozen — reading
  // it unconditionally (e.g. `frozen()?.x ?? mouse().x`) would re-subscribe
  // the panel to the ticking source and defeat the freeze.
  const panelEntries = (): Array<[string, string]> => {
    const f = frozen();
    return f && contentFrozen() ? f.entries : filtered();
  };
  const panelX = (): number => { const f = frozen(); return f ? f.x : mouse().x; };
  const panelY = (): number => { const f = frozen(); return f ? f.y : mouse().y; };
  const panelAnchor = (): KvTooltipAnchor | undefined => {
    const f = frozen();
    // A frozen null anchor means "was never anchored" — stay in cursor mode
    // rather than falling back to the live prop, which would unfreeze it.
    return f ? (f.anchor ?? undefined) : props.anchor;
  };

  // Hover-intent state machine — extracted to _internal/hoverIntent.ts so the
  // logic is unit-testable without mounting JSX. Non-interactive callers see
  // instant hide (preserved behavior); interactive mode debounces by
  // hideDelayMs and cancels on either trigger or panel re-entry.
  const hoverIntent = createHoverIntent({
    setVisible,
    shouldShow,
    interactive,
    hideDelayMs,
    showDelayMs,
    hideOnPointerDown: () => props.hideOnPointerDown ?? false,
    blockShow: () =>
      (props.suppressWhileTopLayerOpen ?? false) && isTopLayerSurfaceOpen(),
  });
  onCleanup(hoverIntent.cleanup);

  // ── hideOnScroll ──────────────────────────────────────────────────────────
  // Installed here rather than in the panel because the panel only exists
  // while visible, and the listener is shared process-wide anyway. `defer`
  // skips the run at creation time — only a real scroll should dismiss.
  ensureViewportListeners();
  createEffect(
    on(
      viewportScrollTick,
      () => {
        if ((props.hideOnScroll ?? false) && visible()) hoverIntent.hideNow();
      },
      { defer: true },
    ),
  );

  // ── Accessible description ────────────────────────────────────────────────
  // The hidden node is the ONLY thing a screen reader can reach (the panel is
  // portalled, transient, and unreferenced). It is always mounted so
  // `aria-describedby` never dangles, and it is what makes this component a
  // legitimate replacement for a native `title` rather than a mouse-only
  // decoration.
  const describeTrigger = (): boolean => props.describeTrigger ?? true;
  const descriptionId = createUniqueId();
  const description = (): string => {
    if (!describeTrigger()) return '';
    const explicit = props.description?.trim();
    if (explicit) return explicit;
    return describeEntries(filtered());
  };
  const hasDescription = (): boolean => description().length > 0;

  let wrapperEl: HTMLSpanElement | undefined;

  /**
   * `aria-describedby` is NOT inherited: a screen reader announces the element
   * the user is on, so the attribute has to sit on the trigger the user
   * actually reaches. That is the wrapper when the trigger is inert text/an
   * icon, but the CHILD when the caller wrapped a real control — announcing a
   * button reads the button's own describedby, never its parent's. So both get
   * it, and the child's existing ids are preserved rather than overwritten.
   */
  createEffect(() => {
    const el = wrapperEl;
    if (!el || !hasDescription()) return;
    const child = el.firstElementChild as HTMLElement | null;
    if (!child || child.id === descriptionId) return;
    const existing = (child.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    if (existing.includes(descriptionId)) return;
    child.setAttribute('aria-describedby', [...existing, descriptionId].join(' '));
    onCleanup(() => {
      const left = (child.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((id) => id && id !== descriptionId);
      if (left.length > 0) child.setAttribute('aria-describedby', left.join(' '));
      else child.removeAttribute('aria-describedby');
    });
  });

  /**
   * AUTO focusability: only wrap-level `tabindex` when the caller's own trigger
   * has none, so a wrapped button keeps exactly one tab stop. Measured from the
   * live DOM (a `<Show>`-gated control can appear later), not from the props.
   */
  const [childFocusable, setChildFocusable] = createSignal(false);
  createEffect(() => {
    // Track the description so the probe re-runs on the same edges the wiring
    // above does; the DOM read itself is untracked by nature.
    hasDescription();
    const el = wrapperEl;
    if (!el) return;
    setChildFocusable(el.querySelector(FOCUSABLE_SELECTOR) !== null);
  });
  const wrapperLayout = (): 'text' | 'control' | 'contents' | 'block' => props.wrapperLayout ?? 'text';
  const wrapperTabIndex = (): number | undefined => {
    if (!describeTrigger() || !hasDescription()) return undefined;
    // A `display: contents` wrapper generates no box, so a tab stop on it would
    // be a focus target with nowhere to draw a focus ring — the child owns the
    // keyboard path in that mode (see `wrapperLayout`).
    if (wrapperLayout() === 'contents') return undefined;
    const forced = props.focusable;
    if (forced !== undefined) return forced ? 0 : undefined;
    return childFocusable() ? undefined : 0;
  };

  /**
   * Escape dismisses a visible panel (WAI-ARIA tooltip pattern). Unconditional
   * and un-propped: a panel the user cannot dismiss without moving the pointer
   * is a keyboard trap over whatever it covers. Listener exists only while the
   * panel does.
   */
  createEffect(() => {
    if (!visible()) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hoverIntent.hideNow();
    };
    document.addEventListener('keydown', onKeyDown, true);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown, true));
  });

  return (
    <span
      ref={wrapperEl}
      class={props.class}
      tabindex={wrapperTabIndex()}
      aria-describedby={hasDescription() ? descriptionId : undefined}
      style={wrapperStyle(wrapperLayout())}
      // Keyboard parity with hover: focus shows the panel, blur hides it.
      // `focusin`/`focusout` (not focus/blur) so focus landing on a CHILD
      // control counts — those bubble, focus/blur do not.
      onFocusIn={() => {
        if (describeTrigger()) hoverIntent.showNow();
      }}
      onFocusOut={() => {
        if (describeTrigger()) hoverIntent.hideNow();
      }}
      onMouseEnter={(e) => {
        // Seed the cursor point from the ENTER event, not the last mousemove.
        // Without this the panel's first frame uses a stale point (or 0,0 on
        // the very first hover) until a mousemove corrects it — invisible in
        // live-follow mode, but `freezeOnShow` would capture that stale point
        // and hold it for the whole show.
        setMouse({ x: e.clientX, y: e.clientY });
        hoverIntent.onTriggerEnter();
      }}
      onMouseMove={(e) => {
        // Ignore moves that originated INSIDE the panel. Solid propagates
        // delegated events out of the `<Portal>` to this logical parent, so
        // without this guard the panel re-positions itself to a cursor that is
        // already on top of it — and walks away from the pointer. The
        // `positionFrozen` rule above is the primary fix; this keeps the
        // tracking honest for any future unfrozen-but-hoverable configuration.
        const target = e.target as Element | null;
        if (target?.closest?.('.ckv-panel')) return;
        setMouse({ x: e.clientX, y: e.clientY });
      }}
      onMouseLeave={hoverIntent.onTriggerLeave}
      onPointerDown={hoverIntent.onTriggerPointerDown}
    >
      {props.children}
      {/* Always mounted (not gated on `visible`): a description that exists
          only while hovered is a description a screen reader can never reach,
          and `aria-describedby` must not point at a missing node. */}
      <Show when={hasDescription()}>
        <span id={descriptionId} style={SR_ONLY_STYLE}>
          {description()}
        </span>
      </Show>
      <Show when={visible() && shouldShow()}>
        <TooltipContent
          entries={panelEntries()}
          x={panelX()}
          y={panelY()}
          extraContent={props.extraContent}
          hysteresisPx={props.hysteresisPx ?? 20}
          edgePadPx={props.edgePadPx ?? 8}
          mouseOffsetX={props.mouseOffsetX ?? 12}
          mouseOffsetY={props.mouseOffsetY ?? 16}
          minWidth={props.minWidth}
          maxWidth={props.maxWidth}
          interactive={interactive()}
          role={props.role ?? 'tooltip'}
          ariaLabel={props.ariaLabel}
          ariaHidden={hasDescription()}
          panelClass={props.panelClass}
          portalTarget={props.portalTarget}
          onPanelMouseEnter={hoverIntent.onPanelEnter}
          onPanelMouseLeave={hoverIntent.onPanelLeave}
          anchor={panelAnchor()}
          placement={props.placement}
          anchorGapPx={props.anchorGapPx}
        />
      </Show>
    </span>
  );
}

// ── Controlled mode: caller owns x/y + visibility ──────────────────────────
export interface KvTooltipPanelProps extends KvTooltipAnchoringProps {
  entries: Record<string, string>;
  /**
   * Cursor / reference coordinates in viewport space. Ignored while `anchor`
   * resolves to a rect; still required so a caller can drop `anchor` at
   * runtime (unmounted anchor element) and fall back to point placement.
   */
  x: number;
  y: number;

  extraContent?: JSX.Element;

  showEmpty?: boolean;
  mouseOffsetX?: number;
  mouseOffsetY?: number;
  hysteresisPx?: number;
  edgePadPx?: number;
  interactive?: boolean;

  minWidth?: number | string;
  maxWidth?: number | string;

  ariaLabel?: string;
  role?: 'tooltip' | 'status';

  class?: string;
  panelClass?: string;
  portalTarget?: HTMLElement;
}

export function KvTooltipPanel(props: KvTooltipPanelProps): JSX.Element {
  const filtered = createMemo(() =>
    filterEntries(props.entries, props.showEmpty ?? false),
  );
  const shouldShow = (): boolean => filtered().length > 0 || props.extraContent !== undefined;

  return (
    <Show when={shouldShow()}>
      <TooltipContent
        entries={filtered()}
        x={props.x}
        y={props.y}
        extraContent={props.extraContent}
        hysteresisPx={props.hysteresisPx ?? 20}
        edgePadPx={props.edgePadPx ?? 8}
        mouseOffsetX={props.mouseOffsetX ?? 12}
        mouseOffsetY={props.mouseOffsetY ?? 16}
        minWidth={props.minWidth}
        maxWidth={props.maxWidth}
        interactive={props.interactive ?? false}
        role={props.role ?? 'tooltip'}
        ariaLabel={props.ariaLabel}
        panelClass={props.panelClass}
        portalTarget={props.portalTarget}
        anchor={props.anchor}
        placement={props.placement}
        anchorGapPx={props.anchorGapPx}
      />
    </Show>
  );
}
