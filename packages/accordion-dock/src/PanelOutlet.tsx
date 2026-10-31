import type { JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
/**
 * Render a panel's subtree into WHICHEVER surface owns it, without rebuilding it. ONE
 * `<Portal>`: changing `mount` MOVES the nodes. See DESIGN_NOTES.md § src/autoHide.tsx:965.
 */
/** ⚠ EXPORTED BUT UNUSED — zero callers. See DESIGN_NOTES.md § src/autoHide.tsx:991. */
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
