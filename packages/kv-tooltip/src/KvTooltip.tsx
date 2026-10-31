import { createEscapeOwner } from '@cujuju/solidjs-hooks';
import {
  children,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
  type JSX,
} from 'solid-js';
import { createHoverIntent } from './_internal/hoverIntent';
import { isTopLayerSurfaceOpen } from './_internal/topLayer';
import {
  ensureViewportListeners,
  viewportScrollTick,
} from './clamp';
import {
  filterEntries,
  resolveAnchor,
  TooltipContent,
  type KvTooltipAnchor,
} from './TooltipContent';
import { createTooltipDescription, SR_ONLY_STYLE, wrapperStyle } from './tooltipWrapper';
import type { KvTooltipProps } from './types';
export type { KvTooltipProps } from './types';

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

  // A hover may open the panel; whether it has content is known only once shown (see `extraContent`).
  const shouldShow = (): boolean => !(props.disabled ?? false);
  /** JSX prop reads build owned trees. Read `extraContent` once per show in this memo; a hover timer has no owner and leaks. */
  const extraContent = children(() => (visible() && shouldShow() ? props.extraContent : undefined));
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
  // Gated on the list the panel RENDERS, so a `freezeOnShow` hold covers visibility as well as content.
  const panelOnScreen = createMemo(
    () => visible() && shouldShow() && (panelEntries().length > 0 || extraContent.toArray().length > 0),
  );

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

  let wrapperEl: HTMLSpanElement | undefined;
  const { describeTrigger, descriptionId, description, hasDescription, wrapperLayout, wrapperTabIndex } =
    createTooltipDescription(props, filtered, () => wrapperEl);

  let panelEl: HTMLElement | undefined;
  const withinTooltip = (node: EventTarget | null): boolean =>
    node instanceof Node && (!!panelEl?.contains(node) || !!wrapperEl?.contains(node));
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
        // Focus moving into the portalled panel is not a new trigger; keep the current anchor.
        if (e.target instanceof Node && panelEl?.contains(e.target)) return;
        if (describeTrigger()) {
          // A pointer on the trigger means the cursor point is fresh (e.g. a click focused it).
          setFocusTarget(pointerOnTrigger ? null : (e.target as Element));
          hoverIntent.showNow();
        }
      }}
      onFocusOut={(e) => {
        // Focus moving between trigger and panel (e.g. an extraContent Copy button) keeps it open.
        if (describeTrigger() && !withinTooltip(e.relatedTarget)) hoverIntent.hideNow();
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
      onPointerDown={(e) => {
        // A press inside an interactive panel bubbles out of the Portal; hiding would eat its click.
        if (e.target instanceof Node && panelEl?.contains(e.target)) return;
        hoverIntent.onTriggerPointerDown();
      }}
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
          extraContent={extraContent()}
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
