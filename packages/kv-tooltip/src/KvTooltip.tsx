import {
  createSignal,
  createMemo,
  createEffect,
  createUniqueId,
  on,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from 'solid-js';
import { createEscapeOwner } from '@cujuju/solidjs-hooks';
import {
  ensureViewportListeners,
  viewportScrollTick,
} from './clamp';
import { createHoverIntent } from './_internal/hoverIntent';
import { isTopLayerSurfaceOpen } from './_internal/topLayer';
import {
  TooltipContent,
  resolveAnchor,
  type KvTooltipAnchor,
  type KvTooltipAnchoringProps,
} from './TooltipContent';

export function filterEntries(
  entries: Record<string, string>,
  showEmpty: boolean,
): Array<[string, string]> {
  return Object.entries(entries).filter(([, v]) =>
    showEmpty ? true : v !== '' && v !== undefined,
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
   * Interactive-mode hide debounce (ms), so the pointer can cross the trigger–panel gap;
   * re-entering either cancels. Default 100 (derived in `_internal/hoverIntent.ts`).
   */
  hideDelayMs?: number;

  /**
   * Rest delay (ms) before showing, so a pointer sweeping through dense triggers flashes nothing.
   * Default 0; no derived default, since it depends on trigger density.
   */
  showDelayMs?: number;

  /**
   * Hold entries, cursor point and anchor rect from show until hide, so live sources don't
   * twitch the panel. `extraContent` stays live; resize/scroll still re-clamp. Default `false`.
   */
  freezeOnShow?: boolean;

  /**
   * Pointerdown on the trigger hides and suppresses re-show until the pointer leaves and
   * returns, so a pending `showDelayMs` can't paint over what the click opened. Default `false`.
   */
  hideOnPointerDown?: boolean;

  /**
   * Don't show while a non-tooltip popover is open. Covers the degraded no-top-layer path and
   * deliberate deference. Default `false`: the check is document-global and would break
   * tooltips inside popovers.
   */
  suppressWhileTopLayerOpen?: boolean;

  /**
   * Hide on any scroll: a fixed panel otherwise strands beside a row that moved. Position
   * re-derives on scroll regardless; use this when the content goes stale. Default `false`.
   */
  hideOnScroll?: boolean;

  ariaLabel?: string;
  role?: 'tooltip' | 'status';

  /**
   * Screen-reader text, via `aria-describedby` (the portalled panel is unreachable). Defaults
   * to "key: value" pairs; `extraContent`-only tooltips MUST pass it or stay mouse-only.
   */
  description?: string;
  /**
   * `false` opts out of the accessible-description machinery (0.2.x mouse-only). On by
   * default: an opt-in a11y contract gets forgotten.
   */
  describeTrigger?: boolean;
  /**
   * Wrapper `tabindex="0"`. Default AUTO: focusable only when it contains no focusable
   * element, so a wrapped control keeps one tab stop.
   */
  focusable?: boolean;

  /**
   * Wrapper layout: `text` (inline, ellipsis), `control` (inline-flex, no clipping), `block`
   * (fills a table cell; move cell padding here), `contents` (boxless; child must be
   * focusable, never anchor to the wrapper).
   */
  wrapperLayout?: 'text' | 'control' | 'contents' | 'block';

  class?: string;
  panelClass?: string;
  portalTarget?: HTMLElement;
}

/** Visually hidden. Inline, not a class, so it stays hidden without the package stylesheet. */
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

/** The attributes `FOCUSABLE_SELECTOR` reads — a change to any of them can flip the AUTO probe. */
const FOCUSABLE_ATTRIBUTES = ['href', 'contenteditable', 'tabindex'];

/**
 * No `position: relative` outside `text`: the portalled fixed panel doesn't need a
 * containing block, and it could create an unwanted stacking context.
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

  // Gated on the list the panel RENDERS, so a `freezeOnShow` hold covers visibility as well as content.
  const shouldShow = (): boolean => !(props.disabled ?? false) && (panelEntries().length > 0 || props.extraContent !== undefined);
  const interactive = (): boolean => props.interactive ?? false;
  const hideDelayMs = (): number => props.hideDelayMs ?? 100;
  const showDelayMs = (): number => props.showDelayMs ?? 0;

  /**
   * Position pinned per show when `freezeOnShow` or interactive: Solid propagates delegated
   * mousemove out of the Portal, so an interactive panel would chase the pointer forever.
   */
  const positionFrozen = (): boolean => (props.freezeOnShow ?? false) || interactive();
  /** CONTENT freezing stays opt-in — an interactive panel may still want live
   *  values, it just may not move. */
  const contentFrozen = (): boolean => props.freezeOnShow ?? false;

  /**
   * Focus target when shown by focus with no pointer on the trigger; the cursor point is stale
   * then, so the panel anchors here.
   */
  const [focusTarget, setFocusTarget] = createSignal<Element | null>(null);
  let pointerOnTrigger = false;
  const effectiveAnchor = (): KvTooltipAnchor | undefined => {
    if (props.anchor !== undefined) return props.anchor;
    const el = focusTarget();
    return el ? () => el.getBoundingClientRect() : undefined;
  };

  const [frozen, setFrozen] = createSignal<FrozenSnapshot | null>(null);
  // `on(visible, …)` runs its callback untracked, so taking the snapshot does
  // NOT subscribe this effect to the very sources it is snapshotting.
  createEffect(
    on(visible, (v) => {
      if (!v || !positionFrozen()) {
        setFrozen(null);
        return;
      }
      const m = mouse();
      setFrozen({ entries: filtered(), x: m.x, y: m.y, anchor: resolveAnchor(effectiveAnchor()) });
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
    return f ? (f.anchor ?? undefined) : effectiveAnchor();
  };

  /** The single "a panel is on screen" predicate: the `<Show>` gate and the Escape listener must agree. */
  const panelOnScreen = createMemo(() => visible() && shouldShow());

  // Hover-intent lives in _internal/hoverIntent.ts so it's unit-testable without JSX.
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
  // Installed here, not in the transient panel; `defer` skips the creation run.
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
  // The hidden node is all a screen reader can reach; always mounted so
  // `aria-describedby` never dangles.
  const describeTrigger = (): boolean => props.describeTrigger ?? true;
  const descriptionId = createUniqueId();
  const description = (): string => {
    if (!describeTrigger()) return '';
    const explicit = props.description?.trim();
    if (explicit) return explicit;
    return describeEntries(filtered());
  };
  const hasDescription = createMemo(() => description().length > 0);

  let wrapperEl: HTMLSpanElement | undefined;

  // Bumped on any DOM change under the wrapper that the trigger probes below
  // depend on, so they follow the live trigger rather than only prop changes.
  const [triggerDomTick, setTriggerDomTick] = createSignal(0);
  onMount(() => {
    if (!wrapperEl) return;
    const observer = new MutationObserver(() => setTriggerDomTick((n) => n + 1));
    observer.observe(wrapperEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: FOCUSABLE_ATTRIBUTES,
    });
    onCleanup(() => observer.disconnect());
    // The wrapper only has children once rendered; seed the memo below.
    setTriggerDomTick((n) => n + 1);
  });

  /**
   * The live trigger element. Memo equality absorbs the wrapper churn the observer
   * reports — Solid's Portal marker enters and leaves on every show.
   */
  const triggerChild = createMemo<HTMLElement | null>(() => {
    triggerDomTick();
    return (wrapperEl?.firstElementChild as HTMLElement | null) ?? null;
  });

  /**
   * `aria-describedby` isn't inherited, so it goes on the wrapper AND the child control users
   * actually reach, preserving the child's existing ids.
   */
  createEffect(() => {
    const child = triggerChild();
    if (!hasDescription()) return;
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
   * AUTO focusability, probed from the live DOM (a `<Show>`-gated control can appear later),
   * so a wrapped button keeps one tab stop.
   */
  const [childFocusable, setChildFocusable] = createSignal(false);
  createEffect(() => {
    // Track the description so the probe re-runs on the same edges the wiring
    // above does; the DOM read itself is untracked by nature.
    hasDescription();
    triggerDomTick();
    const el = wrapperEl;
    if (!el) return;
    setChildFocusable(el.querySelector(FOCUSABLE_SELECTOR) !== null);
  });
  const wrapperLayout = (): 'text' | 'control' | 'contents' | 'block' => props.wrapperLayout ?? 'text';
  const wrapperTabIndex = (): number | undefined => {
    if (!describeTrigger() || !hasDescription()) return undefined;
    // `display: contents` has no box to draw a focus ring; the child owns the keyboard path.
    if (wrapperLayout() === 'contents') return undefined;
    const forced = props.focusable;
    if (forced !== undefined) return forced ? 0 : undefined;
    return childFocusable() ? undefined : 0;
  };

  let panelEl: HTMLElement | undefined;
  /**
   * Escape dismisses a visible panel (WAI-ARIA). A tooltip over an open menu sits above it on
   * the shared stack, so it hides alone.
   */
  createEscapeOwner({
    open: panelOnScreen,
    onDismiss: () => hoverIntent.hideNow(),
    owns: () => [panelEl, wrapperEl],
    transparent: true,
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
      onFocusIn={(e) => {
        if (describeTrigger()) {
          // A pointer on the trigger means the cursor point is fresh (e.g. a click focused it).
          setFocusTarget(pointerOnTrigger ? null : (e.target as Element));
          hoverIntent.showNow();
        }
      }}
      onFocusOut={() => {
        if (describeTrigger()) hoverIntent.hideNow();
      }}
      onMouseEnter={(e) => {
        // Seed from the ENTER event: otherwise `freezeOnShow` captures a stale point (0,0 on first hover).
        setMouse({ x: e.clientX, y: e.clientY });
        pointerOnTrigger = true;
        setFocusTarget(null);
        hoverIntent.onTriggerEnter();
      }}
      onMouseMove={(e) => {
        // Ignore moves from inside the panel: delegated events bubble out of the Portal, and the
        // panel would walk away from the pointer. Backstop to `positionFrozen`.
        const target = e.target as Element | null;
        if (target?.closest?.('.ckv-panel')) return;
        setMouse({ x: e.clientX, y: e.clientY });
      }}
      onMouseLeave={() => {
        pointerOnTrigger = false;
        hoverIntent.onTriggerLeave();
      }}
      onPointerDown={hoverIntent.onTriggerPointerDown}
    >
      {props.children}
      {/* Always mounted: a hover-only description is unreachable by screen readers,
                and `aria-describedby` must not dangle. */}
      <Show when={hasDescription()}>
        <span id={descriptionId} style={SR_ONLY_STYLE}>
          {description()}
        </span>
      </Show>
      <Show when={panelOnScreen()}>
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
          // Resync on platform dismissal, or `visible()` stays true and the next hover is a no-op.
          onPlatformDismiss={hoverIntent.hideNow}
          panelRef={(el) => (panelEl = el)}
          anchor={panelAnchor()}
          placement={props.placement}
          anchorGapPx={props.anchorGapPx}
        />
      </Show>
    </span>
  );
}
