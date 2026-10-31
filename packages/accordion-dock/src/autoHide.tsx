import { getGlobalTarget, safeAddEventListener } from '@cujuju/solidjs-hooks';
import { For, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';

import {
  DISMISS_SUPPRESS_SELECTOR,
  FLYOUT_CONTENT_CLASS,
  FLYOUT_HOVER_ENTER_DELAY_MS,
  FLYOUT_HOVER_LEAVE_GRACE_MS,
  type AutoHideApi,
  type AutoHideOptions,
  type FlyoutOpenCause,
} from './autoHideModel';
import { Flyout } from './Flyout';
export {
  FLYOUT_CONTENT_CLASS,
  FLYOUT_DEFAULT_WIDTH_PX,
  FLYOUT_FALLBACK_MAX_HEIGHT_VH,
  FLYOUT_HOVER_ENTER_DELAY_MS,
  FLYOUT_HOVER_LEAVE_GRACE_MS,
  FLYOUT_SHELL_CLASS,
  flyoutCrossAxis,
} from './autoHideModel';
export type { AutoHideApi, AutoHideGroup, AutoHideOptions } from './autoHideModel';
export {
  PANEL_OUTLET_CONTAINER_ATTR,
  PANEL_OUTLET_HOST_ATTR,
  PanelOutlet,
  flyoutDataAttr,
} from './PanelOutlet';

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

  /* Read at FIRE time, so a reactively computed delay is honoured without re-attaching listeners. See DESIGN_NOTES.md § src/autoHide.tsx:483. */
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
    // Unregistered (unmounted) panels keep their open state but have nothing to fly out.
    const meta = group.meta(id);
    return meta !== undefined && !meta.isLeaf;
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
    // Move focus before removing its node so the next Tab does not restart at the document top. See DESIGN_NOTES.md § src/autoHide.tsx:585.
    const surface = surfaceOf(id);
    const active = document.activeElement;
    if (surface !== undefined && active instanceof Node && surface.contains(active)) {
      group.activatorElOf(id)?.focus();
    }
    causes.delete(id);
    group.setOpen(id, false);
  };

  /** Tab-away dismissal: the primitive covers outside pointerdown and Escape, neither of which fires when focus leaves by keyboard. See DESIGN_NOTES.md § src/autoHide.tsx:602. */
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
    // The pointer path's exemption: a portalled child surface (a select's options) is still inside.
    const targetEl = target instanceof Element ? target : target.parentElement;
    if (targetEl?.closest(DISMISS_SUPPRESS_SELECTOR)) return;
    for (const id of open) {
      if (surfaceOf(id)?.contains(target) === true) continue;
      if (group.activatorElOf(id)?.contains(target) === true) continue;
      dismiss(id);
    }
  };
  safeAddEventListener(
    getGlobalTarget('document'),
    'focusin',
    onFocusIn as EventListener,
  );

  onCleanup(() => {
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
