import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { AnchoredPopover, type AnchoredPlacement } from '@cujuju/solidjs-anchored-popover';
import { Close, Pin, PinOff } from './icons';
import type {
  AccordionOrientation,
  AccordionPolicy,
  AccordionRailSide,
  ActivatorHoverProps,
  PanelMeta,
} from './context';

/**
 * AUTO-HIDE — an unpinned open panel renders as a flyout; pinning promotes it to a column.
 * Flyout-ness is DERIVED. See DESIGN_NOTES.md § src/autoHide.tsx:22.
 */

/** Delay before a hovered activator opens its flyout, ms. Must exceed the incidental dwell
 *  along the rail; 350ms. See DESIGN_NOTES.md § src/autoHide.tsx:100. */
export const FLYOUT_HOVER_ENTER_DELAY_MS = 350;

/** Grace after the pointer leaves the button or flyout, ms. Shorter than the enter delay:
 *  reopening is the cheaper mistake. See DESIGN_NOTES.md § src/autoHide.tsx:118. */
export const FLYOUT_HOVER_LEAVE_GRACE_MS = 260;

/** Fallback max height as a fraction of the viewport, used only when the rail cannot be
 *  measured — which means the markup contract below changed. */
export const FLYOUT_FALLBACK_MAX_HEIGHT_VH = 60;

/** Flyout width when the panel has no dragged size, px. Matches `--acc-col-width` so pinning
 *  does not resize it. */
export const FLYOUT_DEFAULT_WIDTH_PX = 230;

/**
 * The flyout's CROSS-AXIS sizing. Horizontal uses the panel's own width; vertical uses
 * `max-content`, floored at the anchor. See DESIGN_NOTES.md § src/autoHide.tsx:154.
 */
export function flyoutCrossAxis(input: {
  orientation: AccordionOrientation;
  /** The panel's stored size along the growth axis — a WIDTH only in horizontal. */
  panelSizePx: number | undefined;
  /** The group's measured width. `0` when it could not be read. */
  groupWidthPx: number;
}): { width: string; minWidth: string; maxWidth?: string } {
  if (input.orientation !== 'vertical') {
    const px = input.panelSizePx ?? FLYOUT_DEFAULT_WIDTH_PX;
    // `maxWidth: 'none'` is written explicitly: a horizontal flyout inheriting the stylesheet's
    // vertical ceiling would be capped below the width the user dragged, so pinning would resize.
    return { width: `${px}px`, minWidth: `${px}px`, maxWidth: 'none' };
  }
  const floor = input.groupWidthPx > 0 ? Math.round(input.groupWidthPx) : FLYOUT_DEFAULT_WIDTH_PX;
  // `maxWidth` deliberately ABSENT — the stylesheet's `--acc-flyout-max-width`
  // applies, and writing it inline here would out-rank a consumer restating it.
  return { width: 'max-content', minWidth: `${floor}px` };
}

/**
 * The group's markup contract, read (never written) to measure a flyout's max height: the
 * rail already spans exactly the dock's growth axis.
 */
const RAIL_SELECTOR = '.acc-rail';

/** The group root, read (never written) as the source of the typography a
 *  Portal'd flyout would otherwise lose — see `inheritedTypographyOf`. */
const GROUP_SELECTOR = '.acc-group';

/**
 * Typography a Portal'd flyout must be told, because it inherits from `<body>` rather than the
 * group. See DESIGN_NOTES.md § src/autoHide.tsx:221.
 */
const INHERITED_TYPOGRAPHY = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
] as const;

/**
 * Read the group's resolved typography as inline style. LONGHANDS, not the `font` shorthand,
 * which serializes empty. See DESIGN_NOTES.md § src/autoHide.tsx:260.
 */
function inheritedTypographyOf(groupEl: Element | null | undefined): Record<string, string> {
  if (groupEl === null || groupEl === undefined) return {};
  // `typeof` guarded for the jsdom/SSR case, where there is no cascade to read.
  if (typeof getComputedStyle !== 'function') return {};
  const computed = getComputedStyle(groupEl);
  const style: Record<string, string> = {};
  for (const prop of INHERITED_TYPOGRAPHY) {
    const value = computed.getPropertyValue(prop);
    if (value !== '') style[prop] = value;
  }
  return style;
}

/**
 * Class on the popover SHELL. A MARKER ONLY — `autoHide.css` defines no rule for it, because
 * a `display`/`visibility` rule here would beat the UA's `[popover]:not(:popover-open)` and
 * leave closed flyouts painted.
 */
const FLYOUT_SHELL_CLASS = 'acc-flyout-shell';

/** Class on the flyout CONTENT element. All visual styling lives in
 *  `autoHide.css` against this class. */
const FLYOUT_CONTENT_CLASS = 'acc-flyout';

/**
 * Cross-package WIRE CONTRACT from `@cujuju/solidjs-context-menu`: Portal'd submenus carry
 * `data-popover-stack`, and coexisting host popovers match the same literal attribute.
 * Duplicated, not imported — the package documents the attribute, not the symbol.
 */
const POPOVER_STACK_SELECTOR = '[data-popover-stack]';

/**
 * Elements whose pointerdown must NOT dismiss a flyout: a right-click menu is Portal'd
 * outside it. See DESIGN_NOTES.md § src/autoHide.tsx:315.
 */
const DISMISS_SUPPRESS_SELECTOR = `${POPOVER_STACK_SELECTOR}, [popover]:not(.${FLYOUT_SHELL_CLASS})`;

/**
 * Why a flyout is open. Drives one thing: whether pointer-leave may dismiss it. A hover-open
 * is a peek, so leaving closes it; a click-open is a decision, so it stays.
 */
type FlyoutOpenCause = 'hover' | 'click';

/**
 * The slice of `AccordionGroupApi` this module consumes. Declared structurally so the module
 * states exactly what it needs and can be tested against a nine-member stub.
 */
export interface AutoHideGroup {
  orientation: Accessor<AccordionOrientation>;
  railSide: Accessor<AccordionRailSide>;
  policy: Accessor<AccordionPolicy>;
  openOrder: Accessor<readonly string[]>;
  meta: (id: string) => PanelMeta | undefined;
  isOpen: (id: string) => boolean;
  isPinned: (id: string) => boolean;
  /**
   * Promote a flyout to a docked column, or demote it back. Required: the flyout renders its
   * own title bar, so without this it would have no pin affordance at all.
   */
  togglePin: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
  sizeOf: (id: string) => number | undefined;
  /** The element representing the panel — its rail button, or the `⋯` trigger once that button
   *  collapses. REACTIVE: the ref fires after first render, and overflow shifts on resize. */
  activatorElOf: (id: string) => HTMLElement | undefined;
  /** Suppresses hover-open mid-gesture — see `onRailPointerEnter`. */
  reorderActiveId: Accessor<string | null>;
  resizing: Accessor<boolean>;
  /**
   * OPTIONAL only so this file compiles before the group grows it. A flyout is Portal'd
   * outside `.acc-group`, so it loses the group's `--acc-*` overrides and would render at
   * comfortable density.
   */
  density?: Accessor<'comfortable' | 'compact'>;
}

export interface AutoHideOptions {
  group: AutoHideGroup;
  /** The group's `autoHide` prop. Inert in `vertical` orientation — see SCOPE. */
  enabled: Accessor<boolean>;
  /** Open a flyout on hover as well as click. Default FALSE — hover is unavailable to keyboard
   *  and touch, so it must stay an accelerator, never the only way in. */
  hoverToOpen?: Accessor<boolean>;
  /** Override for {@link FLYOUT_HOVER_ENTER_DELAY_MS}. Undefined keeps the default, which is
   *  tuned for the horizontal rail; a vertical dock wants a much smaller one. */
  hoverOpenDelayMs?: Accessor<number | undefined>;
}

export interface AutoHideApi {
  /** True when `id` should render as an overlay rather than a column. The
   *  derivation at the top of this file, and the only state question this
   *  module answers. */
  isFlyout: (id: string) => boolean;
  /** Where a flying-out panel's subtree should mount, or undefined when it belongs in its
   *  column. Consumed by `AccordionPanel`'s own Portal. */
  flyoutMountFor: (id: string) => HTMLElement | undefined;
  /**
   * Spread on the panel's ACTIVATOR — the rail button in horizontal, the header bar in
   * vertical. Empty when hover-to-open is off, so the listeners are not attached at all.
   */
  activatorHoverProps: (id: string) => ActivatorHoverProps;
  /** Dismiss a flyout: closes the panel and returns focus to its rail button if
   *  focus was inside. */
  dismiss: (id: string) => void;
  /** Render ONCE inside the group. Every open flyout's popover lives here. */
  element: JSX.Element;
}

/** Per-flyout host element, published reactively so the panel's Portal can
 *  re-target the moment the popover's content div exists. */
type HostMap = ReadonlyMap<string, HTMLElement>;

export function createAutoHide(options: AutoHideOptions): AutoHideApi {
  const group = options.group;
  const [hosts, setHosts] = createSignal<HostMap>(new Map());

  /**
   * Open cause per flyout id. Not persisted: a restored session has no pointer over anything,
   * so every restored flyout is a decision — which the `click` default gives it.
   */
  const causes = new Map<string, FlyoutOpenCause>();

  /**
   * Drop the open-cause for anything no longer open: a stale 'hover' entry would dismiss a
   * reopened flyout. See DESIGN_NOTES.md § src/autoHide.tsx:463.
   */
  createEffect(() => {
    const open = new Set(group.openOrder());
    for (const id of [...causes.keys()]) if (!open.has(id)) causes.delete(id);
  });

  const hoverEnabled = (): boolean => options.hoverToOpen?.() ?? false;

  /* Read at FIRE time, so a reactively computed delay is honoured without re-attaching
   listeners. A negative or non-finite override falls back to the default — `setTimeout`
   would treat it as 0. */
  const hoverOpenDelay = (): number => {
    const override = options.hoverOpenDelayMs?.();
    return override !== undefined && Number.isFinite(override) && override >= 0
      ? override
      : FLYOUT_HOVER_ENTER_DELAY_MS;
  };

  const isFlyout = (id: string): boolean => {
    if (!options.enabled()) return false;
    // NO ORIENTATION GATE — see SCOPE at the top of the file. Both orientations
    // have an activator that survives the dismissal, so both can fly out.
    if (!group.isOpen(id)) return false;
    if (group.isPinned(id)) return false;
    // A leaf has no rail button, so no anchor to place against — and it is terminal by
    // definition, the RESULT of a selection rather than something that should evaporate.
    return group.meta(id)?.isLeaf !== true;
  };

  /** Open flyouts in the group's own open sequence, so two coexisting flyouts
   *  under `multi` paint in a stable order rather than in Map iteration order. */
  const flyoutIds = createMemo<readonly string[]>(() =>
    group.openOrder().filter((id) => isFlyout(id)),
  );

  // ── Hover intent ──────────────────────────────────────────────────────────
  // One pending ENTER at a time (the pointer has one position), but a LEAVE timer per id,
  // because under `multi` several flyouts can wind down at once.
  let enterTimer: { id: string; handle: number } | null = null;
  const leaveTimers = new Map<string, number>();

  const cancelEnter = (): void => {
    if (enterTimer === null) return;
    window.clearTimeout(enterTimer.handle);
    enterTimer = null;
  };

  const cancelLeave = (id: string): void => {
    const handle = leaveTimers.get(id);
    if (handle === undefined) return;
    window.clearTimeout(handle);
    leaveTimers.delete(id);
  };

  const scheduleLeave = (id: string): void => {
    // A click-opened flyout ignores pointer-leave entirely — see FlyoutOpenCause.
    if (causes.get(id) !== 'hover') return;
    cancelLeave(id);
    leaveTimers.set(
      id,
      window.setTimeout(() => {
        leaveTimers.delete(id);
        if (causes.get(id) === 'hover') dismiss(id);
      }, FLYOUT_HOVER_LEAVE_GRACE_MS),
    );
  };

  const onRailPointerEnter = (id: string, e: PointerEvent): void => {
    // Re-entering a flyout's own button is a reprieve, not a new open.
    cancelLeave(id);
    if (!hoverEnabled()) return;
    // Touch has no hover: a `touch` pointerenter arrives fused with the tap that
    // is ALREADY going to toggle the panel via onClick. Acting on both would
    // open and immediately re-toggle.
    if (e.pointerType === 'touch') return;
    // Mid-gesture the pointer's position is a side effect, not interest: a rail button dragged
    // past during a reorder, or crossed during a splitter drag, must not open anything.
    if (group.reorderActiveId() !== null || group.resizing()) return;
    if (group.isPinned(id)) return; // docked column: hovering its button is a no-op
    if (group.isOpen(id)) return; // already flying out
    cancelEnter();
    enterTimer = {
      id,
      handle: window.setTimeout(() => {
        enterTimer = null;
        // Re-check on fire: the delay is long enough for the panel to have been
        // opened, pinned or unregistered while the timer was pending.
        if (group.isOpen(id) || group.isPinned(id)) return;
        causes.set(id, 'hover');
        group.setOpen(id, true);
      }, hoverOpenDelay()),
    };
  };

  const onRailPointerLeave = (id: string): void => {
    if (enterTimer?.id === id) cancelEnter();
    scheduleLeave(id);
  };

  // ── Dismissal ─────────────────────────────────────────────────────────────

  const dismiss = (id: string): void => {
    cancelLeave(id);
    if (enterTimer?.id === id) cancelEnter();
    // Focus must never be left on a node about to be removed — the browser drops it to <body>
    // and the next Tab restarts from the top of the document.
    const surface = surfaceOf(id);
    const active = document.activeElement;
    if (surface !== undefined && active instanceof Node && surface.contains(active)) {
      group.activatorElOf(id)?.focus();
    }
    causes.delete(id);
    group.setOpen(id, false);
  };

  /**
   * Tab-away dismissal: the primitive covers outside pointerdown and Escape, neither of which
   * fires when focus leaves by keyboard. `focusin`, not `focusout`, which also fires when the
   * window loses focus.
   */
  /** The whole flyout SURFACE, not just its content mount: focusing the title bar's pin read
   *  as focus leaving. See DESIGN_NOTES.md § src/autoHide.tsx:612. */
  const surfaceOf = (id: string): Element | undefined => {
    const host = hosts().get(id);
    return host?.closest(`.${FLYOUT_CONTENT_CLASS}`) ?? host;
  };

  const onFocusIn = (e: FocusEvent): void => {
    const open = flyoutIds();
    if (open.length === 0) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    for (const id of open) {
      if (surfaceOf(id)?.contains(target) === true) continue;
      if (group.activatorElOf(id)?.contains(target) === true) continue;
      dismiss(id);
    }
  };
  document.addEventListener('focusin', onFocusIn);

  onCleanup(() => {
    document.removeEventListener('focusin', onFocusIn);
    cancelEnter();
    for (const handle of leaveTimers.values()) window.clearTimeout(handle);
    leaveTimers.clear();
  });

  const registerHost = (id: string, el: HTMLElement | null): void => {
    setHosts((prev) => {
      const next = new Map(prev);
      if (el === null) next.delete(id);
      else next.set(id, el);
      return next;
    });
  };

  const element = (
    <For each={flyoutIds()}>
      {(id) => (
        <Flyout
          id={id}
          group={group}
          registerHost={registerHost}
          onDismiss={() => dismiss(id)}
          onPointerEnter={() => cancelLeave(id)}
          onPointerLeave={() => scheduleLeave(id)}
          onCommit={() => causes.set(id, 'click')}
          /* A DELIBERATELY-opened flyout takes focus; a hover-opened one does not. Without this the
                       content had no keyboard path. See DESIGN_NOTES.md § src/autoHide.tsx:672. */
          autoFocus={causes.get(id) !== 'hover'}
        />
      )}
    </For>
  );

  return {
    isFlyout,
    flyoutMountFor: (id) => (isFlyout(id) ? hosts().get(id) : undefined),
    activatorHoverProps: (id) =>
      // With hover-open off nothing can be hover-opened, so there is no pending leave to cancel
      // and the ENTER listener is pure cost. Attach neither.
      hoverEnabled()
        ? {
            onPointerEnter: (e: PointerEvent) => onRailPointerEnter(id, e),
            onPointerLeave: () => onRailPointerLeave(id),
          }
        : {},
    dismiss,
    element,
  };
}

/**
 * One flyout: the popover shell, its placement inputs, and the host the panel's subtree
 * portals into. It renders no panel content — that arrives from `AccordionPanel`.
 */
function Flyout(props: {
  id: string;
  group: AutoHideGroup;
  registerHost: (id: string, el: HTMLElement | null) => void;
  onDismiss: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onCommit: () => void;
  autoFocus: boolean;
}): JSX.Element {
  /** The popover's content element, once it exists — the whole flyout surface. */
  let surface: HTMLElement | undefined;

  /**
   * Move focus in once the popover is actually focusable, driven by the primitive's `onShown`.
   * See DESIGN_NOTES.md § src/autoHide.tsx:734.
   */
  const focusSurface = (): void => {
    if (!props.autoFocus) return;
    // The surface itself, not its first focusable child — the dialog pattern: the reader
    // announces the panel's label, and the next Tab enters content in document order.
    surface?.focus();
  };
  // The anchor is READ REACTIVELY, not captured: the rail button's ref fires after this
  // component first renders, and a rail re-render can replace the element.
  const anchor = (): HTMLElement | null | undefined => props.group.activatorElOf(props.id);

  /**
   * The flyout emerges the way panels grow, so it appears in the same place docked or not:
   * horizontal from the rail's outer edge, vertical downward from the header bar.
   */
  const placement = (): AnchoredPlacement => {
    if (props.group.orientation() === 'vertical') return 'below-start';
    return props.group.railSide() === 'left' ? 'right-start' : 'left-start';
  };

  /** The group element — the vertical flyout's width reference, and the source of
   *  the typography the Portal would otherwise lose. */
  const groupEl = (): Element | null | undefined => anchor()?.closest(GROUP_SELECTOR);

  /** CROSS-AXIS size. The decision itself is `flyoutCrossAxis` — pure, and
   *  documented there; this only supplies the two measurements it needs. */
  const crossAxis = (): { width: string; minWidth: string; maxWidth?: string } => {
    const el = groupEl();
    return flyoutCrossAxis({
      orientation: props.group.orientation(),
      panelSizePx: props.group.sizeOf(props.id),
      groupWidthPx: el instanceof HTMLElement ? el.getBoundingClientRect().width : 0,
    });
  };

  /**
   * A flyout is at most as tall as the dock. The rail is measured because it already spans
   * exactly the dock's growth-axis extent.
   */
  const maxHeight = (): string => {
    // Re-runs when the rail button's ref lands. The MEASURED element differs by orientation for
    // one reason: measure whatever spans the growth axis — the rail, or the group in vertical.
    const source =
      props.group.orientation() === 'vertical'
        ? groupEl()
        : anchor()?.closest(RAIL_SELECTOR);
    if (source === null || source === undefined) return `${FLYOUT_FALLBACK_MAX_HEIGHT_VH}vh`;
    return `${Math.round(source.getBoundingClientRect().height)}px`;
  };

  onCleanup(() => props.registerHost(props.id, null));

  return (
    <AnchoredPopover
      open={() => true}
      anchor={() => anchor() ?? null}
      placement={placement()}
      onDismiss={props.onDismiss}
      onShown={focusSurface}
      shouldSuppressDismiss={(target) => target.closest(DISMISS_SUPPRESS_SELECTOR) !== null}
      shellClass={FLYOUT_SHELL_CLASS}
      shellStyle={() => {
        const style: Record<string, string> = {
          // Typography FIRST, so a host restyling through the tokens below still out-ranks the
          // inherited baseline. Sourced from the group via the anchor, which the flyout already holds.
          ...inheritedTypographyOf(groupEl()),
          '--acc-flyout-width': crossAxis().width,
          '--acc-flyout-min-width': crossAxis().minWidth,
          '--acc-flyout-max-height': maxHeight(),
        };
        // Absent in vertical, so the stylesheet's own ceiling token applies.
        const maxWidth = crossAxis().maxWidth;
        if (maxWidth !== undefined) style['--acc-flyout-max-width'] = maxWidth;
        // The per-panel accent recolours this panel's pin and focus ring. It inherits in the dock;
        // a Portal'd flyout is not a descendant, so it is restated here.
        const accent = props.group.meta(props.id)?.accent();
        if (accent !== undefined) style['--acc-accent'] = accent;
        return style;
      }}
      class={FLYOUT_CONTENT_CLASS}
      aria-label={labelOf(props.group.meta(props.id))}
      /* Pointer intent is asked of the WHOLE surface, not the content host: `pointerleave` does
              not bubble. See DESIGN_NOTES.md § src/autoHide.tsx:857. */
      contentRef={(el) => {
        surface = el;
        // Focusable programmatically but NOT in the tab sequence: the flyout is a destination for
        // the focus move above and for a click, never something tabbed into from the document.
        el.tabIndex = -1;
        // A pointerdown anywhere on the surface promotes the peek to a decision. Bubble phase, so
        // the pin and close buttons' `stopPropagation` still pre-empts it.
        el.addEventListener('pointerdown', props.onCommit);
        el.addEventListener('pointerenter', props.onPointerEnter);
        el.addEventListener('pointerleave', props.onPointerLeave);
      }}
    >
      {/* The flyout's OWN title bar, carrying a docked column's classes. Without this a flyout
             had no pin. See DESIGN_NOTES.md § src/autoHide.tsx:886. */}
      <div class="acc-col-bar">
        <Show when={props.group.meta(props.id)?.icon()}>
          <span class="acc-icon">{props.group.meta(props.id)?.icon()}</span>
        </Show>
        <span class="acc-title">{props.group.meta(props.id)?.title()}</span>
        <Show when={props.group.meta(props.id)?.count() !== undefined}>
          <span class="acc-count">{props.group.meta(props.id)?.count()}</span>
        </Show>
        <div class="acc-header-tail">
          <Show when={props.group.meta(props.id)?.pinnable() === true}>
            <button
              type="button"
              class="acc-pin"
              data-no-drag
              aria-pressed={props.group.isPinned(props.id)}
              title="Pin — dock this panel as a column instead of a flyout"
              /* Stops the pointerdown from also reaching `onCommit` below, which
                 would promote the peek to a click-opened flyout in the same
                 gesture that is about to dock it outright. */
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => props.group.togglePin(props.id)}
            >
              {/* State, not action — see the column bar's pin. A flyout is by
                  definition unpinned, so this is the un-pinned glyph until the
                  click that docks it. */}
              <Show when={props.group.isPinned(props.id)} fallback={<PinOff />}>
                <Pin />
              </Show>
            </button>
          </Show>
          <button
            type="button"
            class="acc-close"
            data-no-drag
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => props.onDismiss()}
          >
            <Close />
          </button>
        </div>
      </div>

      <div
        class="acc-flyout-host"
        /* Restates the group's density inside the Portal'd surface — see the `density` note on
           AutoHideGroup. Tokens set here inherit to the flyout's whole subtree. */
        data-density={props.group.density?.() ?? 'comfortable'}
        ref={(el) => props.registerHost(props.id, el)}
      />
    </AnchoredPopover>
  );
}

/** Native-tooltip-or-title as an accessible name, when either is a plain string.
 *  A JSX title cannot become an `aria-label`; the content's own
 *  `aria-labelledby` still names the region in that case. */
function labelOf(meta: PanelMeta | undefined): string | undefined {
  if (meta === undefined) return undefined;
  const tooltip = meta.tooltip();
  if (tooltip !== undefined) return tooltip;
  const title = meta.title();
  return typeof title === 'string' ? title : undefined;
}

/**
 * Render a panel's subtree into WHICHEVER surface owns it, without rebuilding it. ONE
 * `<Portal>`: changing `mount` MOVES the nodes. See DESIGN_NOTES.md § src/autoHide.tsx:965.
 */
/**
 * ⚠ EXPORTED BUT UNUSED — zero callers. `AccordionPanel` renders the same re-targeting Portal
 * inline. Kept because it documents the mechanism a consumer building its own shell would want.
 */
export function PanelOutlet(props: {
  /** Alternate surfaces, highest priority first. The first one to return an
   *  element wins; if none does, the panel's own docked host is used. */
  mounts: ReadonlyArray<() => HTMLElement | undefined>;
  children: JSX.Element;
}): JSX.Element {
  // Not reactive and does not need to be: created with this component, lives
  // exactly as long. Portal reads `mount` inside an effect, which runs after
  // refs are filled.
  let dockHost!: HTMLDivElement;

  const mount = (): HTMLElement => {
    for (const candidate of props.mounts) {
      const el = candidate();
      if (el !== undefined) return el;
    }
    return dockHost;
  };

  const decorateContainer = (container: HTMLDivElement): void => {
    container.setAttribute(PANEL_OUTLET_CONTAINER_ATTR, '');
    // The container is a box in an alternate surface (it must fill the flyout or popup) and a
    // non-box in the dock. Read when Portal re-runs after a mount change.
    const docked = mount() === dockHost;
    container.style.display = docked ? 'contents' : 'flex';
    if (docked) return;
    container.style.flexDirection = 'column';
    container.style.flex = '1 1 auto';
    container.style.minHeight = '0';
  };

  return (
    <div
      ref={(el) => {
        dockHost = el;
        el.setAttribute(PANEL_OUTLET_HOST_ATTR, '');
      }}
      style={{ display: 'contents' }}
    >
      <Portal mount={mount()} ref={decorateContainer}>
        {props.children}
      </Portal>
    </div>
  );
}

/** The two wrappers `PanelOutlet` introduces. Named constants because
 *  `styles.css` has to reference them by name — see the handoff's CSS note. */
export const PANEL_OUTLET_HOST_ATTR = 'data-acc-outlet-host';
export const PANEL_OUTLET_CONTAINER_ATTR = 'data-acc-outlet';

/** Convenience for the panel's own element: `data-flyout` drives the CSS that
 *  collapses a flying-out panel's docked shell out of the column layout. */
export function flyoutDataAttr(isFlyout: boolean): 'true' | 'false' {
  return isFlyout ? 'true' : 'false';
}

/** Re-exported so a consumer wiring `Show` around chrome does not have to
 *  duplicate the class name that `autoHide.css` styles. */
export { FLYOUT_CONTENT_CLASS, FLYOUT_SHELL_CLASS };
