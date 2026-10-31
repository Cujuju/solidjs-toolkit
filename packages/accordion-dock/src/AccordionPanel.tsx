import { Show, createUniqueId, onCleanup, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { flyoutDataAttr } from './autoHide';
import { useAccordionGroup } from './context';
import { Chevron } from './icons';
import { createPanelState } from './panelState';
import { SlotIf } from './SlotIf';
import { Splitter } from './Splitter';

import type { AccordionPanelProps } from './AccordionPanel.types';
import { CloseButton, PanelPinButton } from './PanelButtons';
export type { AccordionPanelProps } from './AccordionPanel.types';
export function AccordionPanel(props: AccordionPanelProps): JSX.Element {
  const group = useAccordionGroup();

  const baseId = createUniqueId();
  const headerId = `${baseId}-header`;
  const contentId = `${baseId}-content`;

  const {
    open,
    pinned,
    pinnable,
    horizontal,
    closable,
    panelId,
    registerHeaderEl,
    registerPanelEl,
    panelEl,
    setPanelEl,
    colBarEl,
    setColBarEl,
    afterPaint,
    menu,
    onKeyDown,
    dragItem,
    dragHandle,
    dragItemAttrs,
    inlineHost,
    setInlineHost,
    contentMount,
    decorateContainer,
    everOpen,
    shouldRender,
    sizeStyle,
  } = createPanelState({ contentId, group, props });

  return (
    <div
      {...dragItemAttrs()}
      ref={(el) => {
        registerPanelEl(el);
        setPanelEl(el);
        // The reorder primitive registers its node through `itemProps.ref`; Solid
        // lets the later ref win, so it is invoked explicitly rather than dropped.
        (dragItem().ref as ((e: HTMLElement) => void) | undefined)?.(el);
      }}
      class={`acc-panel ${props.class ?? ''}`.trim()}
      data-open={open() ? 'true' : 'false'}
      data-pinned={pinned() ? 'true' : 'false'}
      /* The docked shell of a flying-out panel: still MOUNTED, owning the refs the group measures, but `autoHide.css` takes it out of the column layout. See DESIGN_NOTES.md § src/AccordionPanel.tsx:305. */
      data-flyout={flyoutDataAttr(group.isFlyout(props.id))}
      /* The column against the rail. Flex `order` decides that visually, and CSS has no
               "first by order" selector — so the component says so out loud. */
      /* Hard against a boundary — the group's edge or the rail — so it drops the separator
               that edge already draws. Under the divider TWO columns qualify. */
      data-col-first={horizontal() && group.isEdgeColumn(props.id) ? 'true' : 'false'}
      /* The last pinned column: its trailing edge IS the rail. */
      data-rail-boundary={
        horizontal() && group.isRailBoundary(props.id) ? 'true' : 'false'
      }
      style={{
        ...(props.accent !== undefined ? { '--acc-accent': props.accent } : {}),
        ...(horizontal()
          ? { order: group.columnOrder(props.id) }
          : /* Vertical panels keep their DOM position but follow the dragged
                         order via flex `order`, so reordering never remounts content. */
            { order: group.order().indexOf(props.id) + 1 }),
        ...sizeStyle(),
        ...(props.style ?? {}),
      }}
    >
      {/* VERTICAL: the activator is a full-width header bar above the content. */}
      <Show when={!horizontal()}>
        {/* The vertical activator. Under auto-hide it is also the flyout's ANCHOR and
                    hover target — the role the rail button plays in horizontal. */}
        <div
          class="acc-header-row"
          {...group.activatorHoverProps(props.id)}
          {...menu.triggerProps}
        >
          <button
            {...dragHandle()}
            ref={registerHeaderEl}
            id={headerId}
            type="button"
            class={`acc-header ${props.headerClass ?? ''}`.trim()}
            title={props.tooltip}
            aria-expanded={open()}
            aria-controls={contentId}
            onClick={() => group.toggle(props.id)}
            onKeyDown={onKeyDown}
          >
            <Chevron />
            <SlotIf
              content={props.icon}
              wrap={(slot) => <span class="acc-icon">{slot}</span>}
            />
            <span class="acc-title">{props.title}</span>
            <Show when={props.count !== undefined}>
              <span class="acc-count">{props.count}</span>
            </Show>
            <Show when={props.badge}>
              <span class="acc-badge" data-badge={props.badge} aria-hidden="true" />
            </Show>
          </button>

          <div class="acc-header-tail">
            <SlotIf
              content={props.actions}
              wrap={(slot) => <div class="acc-actions">{slot}</div>}
            />
            <PanelPinButton
              group={group}
              id={props.id}
              shown={pinnable()}
              pinned={pinned()}
            />
            <Show when={closable() && open()}>
              <CloseButton onClick={() => group.setOpen(props.id, false)} />
            </Show>
          </div>
        </div>
      </Show>

      {/* HORIZONTAL: the activator moved to the rail, so the column keeps only a title
                bar — where the pin and close must live, a rail button being too narrow. */}
      <Show when={horizontal() && open()}>
        <div class="acc-col-bar" {...menu.triggerProps}>
          {/*
                                THE TITLE BAR IS AN ACTIVATOR, not a label: clicking it collapses the column
                                while the panel stays pinned. See DESIGN_NOTES.md § src/AccordionPanel.tsx:392.
                              */}
          <button
            {...dragHandle()}
            /* Claims the activator slot ONLY when no rail button exists. See DESIGN_NOTES.md § src/AccordionPanel.tsx:415. */
            ref={(el) => {
              setColBarEl(el);
              // Released on unmount, as `slotRef` did, so the effect never holds a detached bar.
              onCleanup(() => setColBarEl(undefined));
            }}
            id={headerId}
            type="button"
            class="acc-col-activator"
            title={props.tooltip}
            aria-expanded={open()}
            aria-controls={contentId}
            onClick={() => group.collapseKeepPin(props.id)}
            onKeyDown={onKeyDown}
          >
            <SlotIf
              content={props.icon}
              wrap={(slot) => <span class="acc-icon">{slot}</span>}
            />
            <span class="acc-title">{props.title}</span>
            <Show when={props.count !== undefined}>
              <span class="acc-count">{props.count}</span>
            </Show>
          </button>
          <div class="acc-header-tail">
            <SlotIf
              content={props.actions}
              wrap={(slot) => <div class="acc-actions">{slot}</div>}
            />
            <PanelPinButton
              group={group}
              id={props.id}
              shown={pinnable()}
              pinned={pinned()}
            />
            <Show when={props.tearOffable ?? false}>
              <button
                type="button"
                class="acc-tearoff"
                data-no-drag
                aria-pressed={group.isTornOff(props.id)}
                title={
                  group.isTornOff(props.id) ? 'Dock this panel' : 'Open in a new window'
                }
                /* Synchronous in the click handler on purpose: window.open needs
                   transient user activation, and an await or a timeout spends it. */
                onClick={() =>
                  group.isTornOff(props.id)
                    ? group.dock(props.id)
                    : group.tearOff(props.id)
                }
              >
                {group.isTornOff(props.id) ? '⤓' : '⤢'}
              </button>
            </Show>
            {/* CLOSE-AND-FORGET. The sibling activator collapses and remembers; this one
                            drops the pin too, so nothing is left pinned-but-invisible. */}
            <Show when={closable()}>
              <CloseButton onClick={() => group.closeAndUnpin(props.id)} />
            </Show>
          </div>
        </div>
      </Show>

      {/* Content stays MOUNTED while collapsed, so a scroll position or in-flight edit
                survives looking at a sibling. `hidden` keeps it out of the a11y tree. */}
      {/*
                    ONE Portal whose mount toggles — never a <Show> swapping branches, which would
                    destroy the state the stay-mounted rule protects.
                    See DESIGN_NOTES.md § src/AccordionPanel.tsx:483.
                  */}
      <div
        ref={setInlineHost}
        id={contentId}
        /* The role follows the ACTIVATOR: horizontal's rail is a `tablist`, so content is a `tabpanel`; vertical is a disclosure revealing a `region`. See DESIGN_NOTES.md § src/AccordionPanel.tsx:503. */
        role={horizontal() ? 'tabpanel' : 'region'}
        /* Referenced only when the labelling element EXISTS. See DESIGN_NOTES.md § src/AccordionPanel.tsx:514. */
        aria-labelledby={!horizontal() || open() ? headerId : undefined}
        class={`acc-content ${props.contentClass ?? ''}`.trim()}
        hidden={!open() || group.isFlyout(props.id) || group.isTornOff(props.id)}
      />
      <Show when={shouldRender() && contentMount()}>
        {(mount) => (
          <Portal mount={mount()} ref={decorateContainer}>
            {props.children}
          </Portal>
        )}
      </Show>

      <Splitter id={props.id} />
      {menu.element}
    </div>
  );
}
