import { type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

import type { TearOffController } from './tearOffModel';
/** Both wrappers the Portal path introduces. `display: contents` when docked, so they cost no
 *  layout — but they DO sit in the selector chain, which the nested-group rules must allow for. */
const TEAR_OFF_HOST_ATTR = 'data-acc-tearoff-host';
const TEAR_OFF_CONTAINER_ATTR = 'data-acc-tearoff';

/**
 * Wrap a panel's content so it renders into the dock OR its window, without being rebuilt.
 * ONE `<Portal>` whose `mount` toggles. See DESIGN_NOTES.md § src/tearOff.tsx:733.
 */
/** ⚠ EXPORTED BUT UNUSED — superseded by the mount-precedence Portal in `AccordionPanel`. See DESIGN_NOTES.md § src/tearOff.tsx:746. */
export function TearOffOutlet(props: {
  id: string;
  api: TearOffController;
  children: JSX.Element;
}): JSX.Element {
  // Not reactive and need not be: created with this component, lives exactly as long. Portal
  // reads `mount` in an effect, which runs after the ref is filled.
  let host!: HTMLDivElement;

  const mount = (): HTMLElement => props.api.mountFor(props.id) ?? host;

  /**
   * Portal calls this with each container it creates, so it is the natural place to make the
   * container's box depend on where it landed.
   */
  const decorateContainer = (container: HTMLDivElement): void => {
    container.setAttribute(TEAR_OFF_CONTAINER_ATTR, '');
    if (props.api.isTornOff(props.id)) {
      // In the popup the container IS the window's content area.
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = '1 1 auto';
      container.style.minHeight = '0';
    } else {
      // In the dock it must not exist as far as layout is concerned.
      container.style.display = 'contents';
    }
  };

  return (
    <div
      ref={(el) => {
        host = el;
        // Set through the ref rather than as a JSX attribute, so the attribute name stays the single
        // named constant the CSS note refers to.
        el.setAttribute(TEAR_OFF_HOST_ATTR, '');
      }}
      style={{ display: 'contents' }}
    >
      <Portal mount={mount()} ref={decorateContainer}>
        {props.children}
      </Portal>
    </div>
  );
}
