import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { AnchoredPopover, type AnchoredPlacement } from '@cujuju/solidjs-anchored-popover';
import { Close, Pin } from './icons';
import type {
  AccordionOrientation,
  AccordionPolicy,
  AccordionRailSide,
  PanelMeta,
} from './context';

/**
 * AUTO-HIDE — an unpinned panel opens as a transient FLYOUT over the columns
 * instead of as a docked column that reflows the layout. Pinning promotes it to
 * a real column; unpinning demotes it back.
 *
 * MOCK, like the rest of this folder.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CENTRAL DESIGN DECISION: flyout-ness is DERIVED, never stored.
 *
 *     isFlyout(id)  ⇔  autoHide ∧ isOpen(id) ∧ ¬isPinned(id) ∧ ¬isLeaf(id)
 *
 * There is no `flyingOut` set, no promote() and no demote(). `togglePin` already
 * flips `isPinned`, so pin-while-flying-out becomes a column and unpin-a-column
 * becomes a flyout with ZERO transition code — the predicate simply reads
 * differently on the next render. Persistence needs nothing new either: `open`
 * and `pinned` are already persisted, and together they reconstruct the flyout
 * state exactly.
 *
 * Storing a third state would have meant three states that can disagree
 * (open/pinned/flying-out), a reconciliation rule for every pair, and a
 * migration for the persisted layout. The derivation cannot disagree with
 * itself.
 *
 * It also makes the pin mean what the phase is for. Today the pin means "exempt
 * from auto-collapse"; here `pinned` IS the docked/transient axis, and the
 * existing exemption falls out of it rather than competing with it.
 *
 * WHAT THIS BUYS FOR FREE — no code in this file, and none needed in the group:
 *
 *  - `single` policy: `setOpen` already closes every unpinned sibling on open.
 *    Under auto-hide "unpinned" means "is a flyout", so opening a flyout closes
 *    the other FLYOUTS and leaves docked columns alone. That is exactly the
 *    rule this phase wants (see the answer to Q5 in the handoff) and it is the
 *    existing code path, untouched.
 *  - `collapseAll` (closes unpinned, spares pinned) becomes "dismiss every
 *    flyout, keep every docked column".
 *  - `expandAll` under `multi` opens flyouts, not columns — which is the
 *    non-destructive reading of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REUSED RATHER THAN REBUILT
 *
 * Placement, viewport clamping, outside-click dismiss, Escape dismiss and the
 * top-layer shell all come from `@cujuju/solidjs-anchored-popover`, which is
 * already a playground dependency. Nothing in this file computes a rect. See
 * the handoff for the point-by-point fit assessment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCOPE — auto-hide applies to `horizontal` orientation only.
 *
 * Not an oversight: the premise of a dismissable overlay is that the activator
 * survives the dismissal, so there is always a way back. In `horizontal` the
 * rail is a permanent strip that no overlay covers. In `vertical` the activator
 * is a full-width header living in the flow, an overlay anchored to it would
 * cover its own siblings, and dismissing it leaves the user where they started
 * with no visible affordance that anything happened. `isFlyout` returns false
 * for `vertical`, so the prop is simply inert there.
 */

/**
 * Delay before a hovered rail button opens its flyout, ms.
 *
 * The rail is a stack of buttons the pointer must travel ALONG to reach any
 * particular one, so every intervening button is hovered in passing. The delay
 * has to exceed that incidental dwell or the traverse leaves a wake of opening
 * overlays.
 *
 * Estimate behind the value (called out as an estimate — not measured here): a
 * rail button is ~28-40px tall, and a deliberate pointer traverse runs at
 * roughly 400-800 px/s, so an intervening button is under the pointer for
 * ~35-100ms. 350ms clears the slow end of that by ~3.5x, while staying well
 * under the ~1s mark where a delay starts reading as "the app is stuck" rather
 * than "I have not committed yet". Tune against real input, not against this
 * arithmetic.
 */
export const FLYOUT_HOVER_ENTER_DELAY_MS = 350;

/**
 * Grace period after the pointer leaves the rail button or the flyout, before
 * the flyout dismisses, ms.
 *
 * Two jobs. First, the pointer crossing the gap between the button and the
 * flyout is briefly over NEITHER — without a grace period the flyout would
 * dismiss in the act of being reached. Second, a pointer that overshoots the
 * flyout's edge by a few px on the way to a control inside it must not be
 * punished.
 *
 * Deliberately shorter than the enter delay: opening is the destructive,
 * uncommitted act (an overlay the user did not ask for), closing is the
 * recoverable one (hover again). Asymmetry favours the cheaper mistake.
 *
 * A "safe triangle" (tracking pointer trajectory toward the flyout) was
 * considered and rejected: the anchor gap here is the popover's 4px default, so
 * the corridor between button and flyout is a few pixels wide and effectively
 * unmissable. Trajectory tracking earns its complexity on wide submenu fans, not
 * on an adjacent panel.
 */
export const FLYOUT_HOVER_LEAVE_GRACE_MS = 260;

/**
 * Fallback max height for a flyout when the rail cannot be measured, as a
 * fraction of the viewport height. The measured path (rail height) is the normal
 * one; this only fires if the rail element is missing, which means the markup
 * contract below has changed.
 */
export const FLYOUT_FALLBACK_MAX_HEIGHT_VH = 60;

/** Flyout width when the panel has no user-dragged size yet, px. Matches the
 *  `--vsa-col-width` default so pinning a flyout does not change its width —
 *  promotion should look like the panel staying put and the layout making room,
 *  not like the panel being resized. */
export const FLYOUT_DEFAULT_WIDTH_PX = 230;

/**
 * The group's own markup contract, read (never written) to measure how tall a
 * flyout may be. A flyout spans at most the dock's growth-axis extent, and the
 * rail is the element that already has exactly that extent.
 */
const RAIL_SELECTOR = '.vsa-rail';

/**
 * Class on the AnchoredPopover SHELL (the element carrying `popover`). A MARKER
 * ONLY: it exists so the dismiss-suppression predicate can tell our flyouts
 * apart from every other popover on the page, and `autoHide.css` deliberately
 * defines NO rule for it.
 *
 * That is a hard constraint, not an omission. The primitive documents a cascade
 * trap: the UA hides a closed popover with
 * `[popover]:not(:popover-open) { display: none }`, which only wins because no
 * author class competes at equal specificity. A `display`/`visibility` rule on
 * `shellClass` would beat it and leave closed flyouts painted on screen.
 */
const FLYOUT_SHELL_CLASS = 'vsa-flyout-shell';

/** Class on the flyout CONTENT element. All visual styling lives in
 *  `autoHide.css` against this class. */
const FLYOUT_CONTENT_CLASS = 'vsa-flyout';

/**
 * Cross-package WIRE CONTRACT, defined by `@cujuju/solidjs-context-menu`
 * (`src/_internal/popoverStack.ts`): every Portal'd submenu carries
 * `data-popover-stack`, and any host popover that must coexist with those menus
 * matches the SAME literal attribute in its dismiss-skip predicate. It is
 * duplicated here rather than imported because the constant is package-private
 * by design — the package documents the attribute, not the symbol.
 */
const POPOVER_STACK_SELECTOR = '[data-popover-stack]';

/**
 * Elements whose pointerdown must NOT dismiss a flyout.
 *
 * A right-click inside a flyout opens the panel context menu, which
 * `ContextMenu` Portals to `<body>` and promotes into the top layer — so by DOM
 * ancestry it is OUTSIDE the flyout, and the naive dismiss would tear the
 * flyout down from under its own menu, taking the menu's reason for existing
 * with it. Any open popover counts, plus the submenu stack above.
 *
 * `:not(.vsa-flyout-shell)` deliberately EXCLUDES our own kind: under `multi`
 * policy two flyouts can coexist, and clicking into one of them is a genuine
 * "you left the other one" signal that should dismiss the other.
 */
const DISMISS_SUPPRESS_SELECTOR = `${POPOVER_STACK_SELECTOR}, [popover]:not(.${FLYOUT_SHELL_CLASS})`;

/**
 * Why a flyout is currently open. Drives ONE thing: whether the pointer leaving
 * it is allowed to dismiss it.
 *
 * A hover-opened flyout is a peek — the pointer leaving is the user withdrawing
 * the request, so it closes. A click-opened flyout is a decision, and closing it
 * because the pointer wandered to a scrollbar, a browser dialog or a second
 * monitor would be hostile. Dismissal mirrors the intent that opened it.
 */
type FlyoutOpenCause = 'hover' | 'click';

/**
 * The slice of `AccordionGroupApi` this module consumes.
 *
 * Declared structurally rather than importing `AccordionGroupApi` wholesale for
 * two reasons: it is the precise, checkable list of what the group must provide
 * (one of its members, `headerElOf`, does not exist yet — see the handoff), and
 * it keeps this file compiling before the group grows it.
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
   * Promote a flyout to a docked column, or demote it back.
   *
   * Required, not optional: the pin is the entire subject of this mode, and a
   * flyout renders its own title bar because the panel's docked one is
   * `display: none` while it floats. Without this the flyout would have no pin
   * affordance at all and the mode would be a one-way trip — which is exactly
   * what shipped until a browser test went looking for the control.
   */
  togglePin: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
  sizeOf: (id: string) => number | undefined;
  /**
   * NEW on `AccordionGroupApi` — the panel's activator element, REACTIVELY.
   * `setHeaderEl` already collects these, but into a plain `Map`, which cannot
   * drive a popover anchor: the flyout renders before the rail button's ref has
   * fired, so a non-reactive read returns undefined once and never corrects
   * itself. See the handoff for the exact change.
   */
  headerElOf: (id: string) => HTMLElement | undefined;
  /** Suppresses hover-open mid-gesture — see `onRailPointerEnter`. */
  reorderActiveId: Accessor<string | null>;
  resizing: Accessor<boolean>;
  /**
   * OPTIONAL, and optional only so this file compiles before the group grows it.
   *
   * A flyout is Portal'd to `<body>` by the popover primitive, so it sits
   * OUTSIDE `.vsa-group` and stops inheriting the token overrides the group
   * carries — `data-density='compact'` rescales the whole dock by overriding
   * `--vsa-*` on the group element, and a flyout that escapes that scope silently
   * renders at comfortable density inside a compact dock. Passing the value lets
   * the flyout host restate it. Recommended: add `density` to
   * `AccordionGroupApi` (it is already an `AccordionGroupProps` field, so this
   * is exposure, not new state).
   */
  density?: Accessor<'comfortable' | 'compact'>;
}

export interface AutoHideOptions {
  group: AutoHideGroup;
  /** The group's `autoHide` prop. Inert in `vertical` orientation — see SCOPE. */
  enabled: Accessor<boolean>;
  /**
   * Open a flyout on hover, in addition to on click. Default FALSE — the
   * reasoning is in the handoff, but in short: click is the primary path
   * because hover is unavailable to keyboard and touch entirely, and an
   * accelerator that silently becomes the only way in is an accessibility
   * defect. When true, click still works; hover is added.
   */
  hoverToOpen?: Accessor<boolean>;
}

export interface AutoHideApi {
  /** True when `id` should render as an overlay rather than a column. The
   *  derivation at the top of this file, and the only state question this
   *  module answers. */
  isFlyout: (id: string) => boolean;
  /** Where a flying-out panel's subtree should mount, or undefined when it
   *  belongs in its column. Feed to `PanelOutlet`. */
  flyoutMountFor: (id: string) => HTMLElement | undefined;
  /** Spread on the rail button. Empty object when hover-to-open is off, so the
   *  listeners are not attached at all rather than attached and inert. */
  railHoverProps: (id: string) => JSX.HTMLAttributes<HTMLElement>;
  /** Dismiss a flyout: closes the panel and returns focus to its rail button if
   *  focus was inside. */
  dismiss: (id: string) => void;
  /** Render ONCE inside the group. Every open flyout's popover lives here. */
  element: JSX.Element;
}

/** Per-flyout host element, published reactively so `PanelOutlet` can re-target
 *  its Portal the moment the popover's content div exists. */
type HostMap = ReadonlyMap<string, HTMLElement>;

export function createAutoHide(options: AutoHideOptions): AutoHideApi {
  const group = options.group;
  const [hosts, setHosts] = createSignal<HostMap>(new Map());

  /**
   * Open cause per flyout id. Ephemeral and intentionally NOT persisted: a
   * restored session has no pointer over anything, so every restored flyout is
   * a decision the user made, not a peek in progress — which is exactly what
   * the `click` default gives it.
   */
  const causes = new Map<string, FlyoutOpenCause>();

  const hoverEnabled = (): boolean => options.hoverToOpen?.() ?? false;

  const isFlyout = (id: string): boolean => {
    if (!options.enabled()) return false;
    // See SCOPE at the top of the file.
    if (group.orientation() !== 'horizontal') return false;
    if (!group.isOpen(id)) return false;
    if (group.isPinned(id)) return false;
    // A leaf has no rail button, so it has no anchor and could not be placed.
    // It is also terminal by definition — the RESULT of a selection, which is
    // the last thing that should evaporate when the pointer moves.
    return group.meta(id)?.isLeaf !== true;
  };

  /** Open flyouts in the group's own open sequence, so two coexisting flyouts
   *  under `multi` paint in a stable order rather than in Map iteration order. */
  const flyoutIds = createMemo<readonly string[]>(() =>
    group.openOrder().filter((id) => isFlyout(id)),
  );

  // ── Hover intent ──────────────────────────────────────────────────────────
  // One pending ENTER at a time (the pointer has one position, so only one
  // button can be a candidate), but a LEAVE timer per id, because under `multi`
  // several flyouts can be winding down at once.
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
    // Mid-gesture, the pointer's position is a side effect of the gesture rather
    // than an expression of interest — a rail button dragged past during a
    // reorder, or crossed during a splitter drag, must not open anything.
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
      }, FLYOUT_HOVER_ENTER_DELAY_MS),
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
    // Focus must never be left on a node that is about to be removed — the
    // browser would drop it to <body> and the next Tab would restart from the
    // top of the document. Returning it to the rail button also puts the user
    // exactly where the keyboard path expects to resume.
    // Against the whole surface, for the same reason `onFocusIn` is — focus
    // resting on the flyout's own pin or close button must still be returned to
    // the rail button, or the browser drops it to <body> and the next Tab
    // restarts from the top of the document.
    const surface = surfaceOf(id);
    const active = document.activeElement;
    if (surface !== undefined && active instanceof Node && surface.contains(active)) {
      group.headerElOf(id)?.focus();
    }
    causes.delete(id);
    group.setOpen(id, false);
  };

  /**
   * Tab-away dismissal. The popover primitive covers outside POINTERDOWN and
   * Escape; neither fires when focus leaves by keyboard, and a flyout the user
   * has tabbed out of is by definition no longer the thing they are working on.
   *
   * `focusin` (fires when focus ARRIVES somewhere) rather than `focusout`: a
   * `focusout` with a null `relatedTarget` also fires when the whole WINDOW
   * loses focus, and dismissing because the user alt-tabbed to another app —
   * losing their peek when they come back — is the exact opposite of helpful.
   */
  /**
   * The whole flyout SURFACE for a panel, not just its content mount.
   *
   * `hosts` registers `.vsa-flyout-host`, which is only where the panel's subtree
   * portals in. The surface around it also holds chrome — the flyout's own title
   * bar, with the pin and the close — and those are as much "inside the flyout"
   * as the content is.
   *
   * Getting this wrong was not cosmetic: focusing the pin landed outside `host`,
   * so the tab-away handler read it as focus leaving and dismissed the panel
   * before the click could toggle anything. The pin appeared to close the panel.
   * Resolved by climbing from the host so that any chrome added later is covered
   * automatically, rather than by registering a second element that a future
   * addition could forget.
   */
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
      if (group.headerElOf(id)?.contains(target) === true) continue;
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
        />
      )}
    </For>
  );

  return {
    isFlyout,
    flyoutMountFor: (id) => (isFlyout(id) ? hosts().get(id) : undefined),
    railHoverProps: (id) =>
      // When hover-to-open is off there is still a reason to attach ENTER: it
      // cancels a pending leave when the pointer returns to the button of a
      // hover-opened flyout. But with hover-open off nothing can be
      // hover-opened, so there is nothing to cancel and the listeners are pure
      // cost. Attach neither.
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
 * One flyout: the popover shell, its placement inputs, and the host element the
 * panel's subtree portals into.
 *
 * It renders NO panel content itself. The content arrives via `PanelOutlet`
 * re-targeting its Portal at `hostEl` — which is what makes promote/demote
 * free of remounts (see `PanelOutlet`).
 */
function Flyout(props: {
  id: string;
  group: AutoHideGroup;
  registerHost: (id: string, el: HTMLElement | null) => void;
  onDismiss: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onCommit: () => void;
}): JSX.Element {
  // The anchor is READ REACTIVELY on every tracked change rather than captured:
  // the rail button's ref fires after this component first renders, and a
  // re-render of the rail (a reorder, a count change) can replace the element.
  // This is precisely why `headerElOf` has to be signal-backed rather than the
  // plain Map the group keeps today.
  const anchor = (): HTMLElement | null | undefined => props.group.headerElOf(props.id);

  /**
   * The flyout emerges from the rail's OUTER edge, i.e. the direction the
   * columns grow. Rail left → columns grow right → `right-start`. This is the
   * same anchoring rule the columns already follow, so a panel appears in the
   * same place whether it is a flyout or a column — which is what makes pinning
   * read as "this stays" rather than as "this moved".
   */
  const placement = (): AnchoredPlacement =>
    props.group.railSide() === 'left' ? 'right-start' : 'left-start';

  /** Width follows the panel's own size, so promotion does not resize it. */
  const widthPx = (): number => props.group.sizeOf(props.id) ?? FLYOUT_DEFAULT_WIDTH_PX;

  /**
   * A flyout may be at most as tall as the dock. The rail is measured because it
   * already spans exactly the dock's growth-axis extent — reading the group
   * element would mean threading another ref through the API for a value the
   * rail already carries.
   */
  const maxHeight = (): string => {
    // Reads `anchor()`, so this re-runs when the rail button's ref lands or is
    // replaced — no second signal, and no side-effecting accessor.
    const rail = anchor()?.closest(RAIL_SELECTOR);
    if (rail === null || rail === undefined) return `${FLYOUT_FALLBACK_MAX_HEIGHT_VH}vh`;
    return `${Math.round(rail.getBoundingClientRect().height)}px`;
  };

  onCleanup(() => props.registerHost(props.id, null));

  return (
    <AnchoredPopover
      open={() => true}
      anchor={() => anchor() ?? null}
      placement={placement()}
      onDismiss={props.onDismiss}
      shouldSuppressDismiss={(target) => target.closest(DISMISS_SUPPRESS_SELECTOR) !== null}
      shellClass={FLYOUT_SHELL_CLASS}
      shellStyle={() => {
        const style: Record<string, string> = {
          '--vsa-flyout-width': `${widthPx()}px`,
          '--vsa-flyout-max-height': maxHeight(),
        };
        // The per-panel accent recolours the pin and the focus ring for this
        // panel only. In the dock it is set on the panel element and inherits;
        // a Portal'd flyout is not a descendant of that element, so it has to be
        // restated here or a panel with an accent loses it exactly when it
        // becomes the focused, floating thing.
        const accent = props.group.meta(props.id)?.accent();
        if (accent !== undefined) style['--vsa-accent'] = accent;
        return style;
      }}
      class={FLYOUT_CONTENT_CLASS}
      aria-label={labelOf(props.group.meta(props.id))}
    >
      {/*
        The flyout's OWN title bar.

        It carries the same classes as a docked column's, deliberately: pinning
        changes where the panel lives, not what it looks like, and a flyout that
        restyled itself on promotion would read as a different panel appearing.

        It has to exist here because the panel's real `.vsa-col-bar` lives in the
        docked shell, which `autoHide.css` takes out of the layout while the panel
        floats. Before this, a flyout had no pin — the one control the entire mode
        is about — and no close either; the only route to pinning was the rail
        button's context menu, which nothing advertises.
      */}
      <div class="vsa-col-bar">
        <Show when={props.group.meta(props.id)?.icon()}>
          <span class="vsa-icon">{props.group.meta(props.id)?.icon()}</span>
        </Show>
        <span class="vsa-title">{props.group.meta(props.id)?.title()}</span>
        <Show when={props.group.meta(props.id)?.count() !== undefined}>
          <span class="vsa-count">{props.group.meta(props.id)?.count()}</span>
        </Show>
        <div class="vsa-header-tail">
          <Show when={props.group.meta(props.id)?.pinnable() === true}>
            <button
              type="button"
              class="vsa-pin"
              data-no-drag
              aria-pressed={props.group.isPinned(props.id)}
              title="Pin — dock this panel as a column instead of a flyout"
              /* Stops the pointerdown from also reaching `onCommit` below, which
                 would promote the peek to a click-opened flyout in the same
                 gesture that is about to dock it outright. */
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => props.group.togglePin(props.id)}
            >
              <Pin />
            </button>
          </Show>
          <button
            type="button"
            class="vsa-close"
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
        class="vsa-flyout-host"
        /* Restates the group's density inside the Portal'd surface — see the
           `density` note on AutoHideGroup. Tokens set here inherit to the
           panel's whole subtree, which is the entire content of the flyout. */
        data-density={props.group.density?.() ?? 'comfortable'}
        ref={(el) => props.registerHost(props.id, el)}
        /* A pointerdown inside promotes the peek to a decision, so it stops
           closing when the pointer leaves. This is the behaviour of a real
           auto-hidden pane: look at it and it goes away, touch it and it
           stays. */
        onPointerDown={props.onCommit}
        onPointerEnter={props.onPointerEnter}
        onPointerLeave={props.onPointerLeave}
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
 * Render a panel's subtree into WHICHEVER surface currently owns it — its
 * flyout, its tear-off window, or its column — without ever rebuilding it.
 *
 * ONE `<Portal>`, whose `mount` is resolved from `mounts` in priority order and
 * falls back to a host element sitting where the panel declares it. Verified in
 * solid-js 1.9.12 (see the header of `tearOff.tsx` for the source walk): Portal
 * reads `mount` inside its effect and CACHES its children memo, so changing the
 * mount MOVES the existing nodes and reuses the existing reactive graph. Scroll
 * position, text selection, an in-flight edit and all component state survive
 * promote, demote, tear-off and dock.
 *
 * The alternative — a `<Show>` swapping an inline branch for a portalled one —
 * re-evaluates the children and throws all of that away on every transition.
 * That is the same reasoning that governs the panel's keep-mounted-while-
 * collapsed rule, applied one level up.
 *
 * SUPERSEDES `TearOffOutlet` in `tearOff.tsx`: this is the same mechanism
 * generalised from one alternate surface to N. Pass tear-off's `mountFor` as
 * one entry in `mounts`.
 *
 * COST, stated plainly: two wrapper elements appear in the panel's DOM. Both are
 * `display: contents` while docked so they add no box and no layout, but they DO
 * sit in the selector chain — the two `.vsa-content > .vsa-group` rules in
 * styles.css need widening. See the handoff.
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
    // The container is the box in an alternate surface (it must fill the flyout
    // or the popup window) and a non-box in the dock (the column's own layout
    // already governs). Read at container-creation time, which is exactly when
    // Portal re-runs after a mount change.
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
export const PANEL_OUTLET_HOST_ATTR = 'data-vsa-outlet-host';
export const PANEL_OUTLET_CONTAINER_ATTR = 'data-vsa-outlet';

/** Convenience for the panel's own element: `data-flyout` drives the CSS that
 *  collapses a flying-out panel's docked shell out of the column layout. */
export function flyoutDataAttr(isFlyout: boolean): 'true' | 'false' {
  return isFlyout ? 'true' : 'false';
}

/** Re-exported so a consumer wiring `Show` around chrome does not have to
 *  duplicate the class name that `autoHide.css` styles. */
export { FLYOUT_CONTENT_CLASS, FLYOUT_SHELL_CLASS };
