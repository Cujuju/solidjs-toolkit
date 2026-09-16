import {
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  onMount,
  untrack,
  type JSX,
} from 'solid-js';
import { createAfterPaint } from '@cujuju/solidjs-hooks';
import { seedDefaultSize, type AccordionDefaultSize } from './contentSize';
import { slotRef, useAccordionGroup } from './context';
import { Close } from './icons';
import { leafChainFor } from './leafChain';
import { columnFlex } from './resize';
import { Splitter } from './Splitter';

export interface AccordionLeafProps {
  /** Stable identity — the key for size persistence. */
  id: string;
  children: JSX.Element;

  /**
   * CONTROLLED visibility. A leaf has no activator, so its open state is always the
   * consumer's — the answer to a selection made upstream. A chained leaf needs its parent
   * open too.
   */
  open: boolean;

  /**
   * The panel or leaf this one hangs off, making it a link in a CHAIN. Naming a LEAF orders
   * the columns. The prop asserts a dependency: parent closed, this closed.
   */
  parentId?: string;

  title?: string | JSX.Element;
  icon?: JSX.Element;
  actions?: JSX.Element;
  /** Show a close (×). Fires `onClose` — the consumer still owns `open`. */
  closable?: boolean;
  onClose?: () => void;

  accent?: string;
  minSize?: number;
  /** This leaf absorbs the group's leftover extent in `fill` — the same declaration
   *  `<AccordionPanel>` takes. A leaf is usually trailing, so ignoring it would silently take
   *  a sibling's promised surplus. */
  grow?: boolean;
  /** This leaf is never larger than its content, with its size as a ceiling it
   *  scrolls past. See `AccordionPanelProps.shrinkToContent`. */
  shrinkToContent?: boolean;
  defaultSize?: AccordionDefaultSize;

  class?: string;
  contentClass?: string;
}

/**
 * A terminal detail pane at the end of the dock — what makes this a MILLER-COLUMN browser. It
 * differs from a panel only in having no activator. See DESIGN_NOTES.md § src/AccordionLeaf.tsx:74.
 */
export function AccordionLeaf(props: AccordionLeafProps): JSX.Element {
  const group = useAccordionGroup();
  const chain = leafChainFor(group);

  const baseId = createUniqueId();
  const contentId = `${baseId}-content`;
  /** Through a slot, so the reference empties on unmount — a leaf mounts and unmounts
   *  constantly, so a never-cleared ref accumulates a detached node per selection. */
  const registerPanelEl = slotRef(group.panelElements, props.id);
  /** This leaf's own column and content elements. Signals, because a size seeded from a
   *  measurement has to know WHEN the boxes arrive. */
  const [panelEl, setPanelEl] = createSignal<HTMLElement | undefined>();
  const [contentEl, setContentEl] = createSignal<HTMLElement | undefined>();
  const afterPaint = createAfterPaint();
  const horizontal = (): boolean => group.orientation() === 'horizontal';

  /** Is the thing this leaf hangs off open? Vacuously true for an unchained leaf, which keeps
   *  the single-leaf case unchanged. */
  const parentOpen = (): boolean => {
    const parent = props.parentId;
    return parent === undefined ? true : group.isOpen(parent);
  };

  /**
       * Open only when the consumer says so AND the parent is open. Deriving the CASCADE here
       * means there is no site to forget it. See DESIGN_NOTES.md § src/AccordionLeaf.tsx:126.
       */
  const effectiveOpen = (): boolean => props.open && parentOpen();

  onMount(() => {
    group.register(
      {
        id: props.id,
        title: () => props.title ?? '',
        railLabel: () => undefined,
        count: () => undefined,
        badge: () => undefined,
        icon: () => props.icon,
        tooltip: () => undefined,
        accent: () => props.accent,
        pinnable: () => false,
        closable: () => props.closable ?? true,
        minSize: () => props.minSize,
        grow: () => props.grow ?? false,
        railClass: () => undefined,
        contentId,
        isLeaf: true,
        // How the group asks this leaf to close. Routed to the same `onClose` the × uses, so "the
        // dock closed it" and "the user closed it" are one path.
        requestClose: () => props.onClose?.(),
      },
      false,
    );
    seedDefaultSize({
      defaultSize: () => props.defaultSize,
      open: effectiveOpen,
      // A leaf never flies out and never tears off, so host and panel come from the same subtree.
      host: contentEl,
      panel: panelEl,
      sizeOf: () => group.sizeOf(props.id),
      setSize: (px) => group.setSize(props.id, px),
      orientation: group.orientation,
      afterPaint,
    });
  });
  onCleanup(() => {
    group.unregister(props.id);
  });

  /**
   * Publish this leaf's place in the chain from an effect, so a changed `parentId` re-links
   * instead of leaving a stale edge.
   */
  createEffect(() => {
    const parent = props.parentId;
    if (parent === undefined) {
      chain.unlink(props.id);
      return;
    }
    chain.link(props.id, parent);
  });
  onCleanup(() => {
    chain.unlink(props.id);
  });

  /**
   * Mirror the EFFECTIVE open state into the group's open list. Not `props.open`: the render
   * gate uses the same accessor, and a disagreement leaves a broken flex `order`.
   */
  createEffect(() => {
    // `setLeafOpen`, not `setOpen`: this is the leaf REPORTING what it decided, and `setOpen`
    // would route straight back here as `requestClose`.
    group.setLeafOpen(props.id, effectiveOpen());
  });

  /**
   * Tell the consumer when the cascade fired, so the selection that opened this leaf is
   * cleared. See DESIGN_NOTES.md § src/AccordionLeaf.tsx:224.
   */
  createEffect(
    on(
      parentOpen,
      (isParentOpen) => {
        if (isParentOpen) return;
        if (!untrack(() => props.open)) return;
        props.onClose?.();
      },
      { defer: true },
    ),
  );

  const sizeStyle = (): JSX.CSSProperties => {
    if (!effectiveOpen()) return {};
    return columnFlex({
      sizePx: group.sizeOf(props.id),
      fill: group.mode() === 'fill',
      trailing: group.neighborOpenId(props.id) === undefined,
      declaresGrow: props.grow ?? false,
      groupHasDeclaredGrower: group.hasDeclaredGrower(),
      shrinkToContent: props.shrinkToContent ?? false,
      axis: group.orientation() === 'horizontal' ? 'width' : 'height',
    });
  };

  /*
   * A closed leaf UNMOUNTS, unlike a panel: it is the RESULT of a selection that is now gone,
   * so no state is worth keeping. See DESIGN_NOTES.md § src/AccordionLeaf.tsx:264.
   */
  return (
    <Show when={effectiveOpen()}>
      <div
        ref={(el) => {
          registerPanelEl(el);
          setPanelEl(el);
        }}
        class={`acc-panel acc-leaf ${props.class ?? ''}`.trim()}
        data-open="true"
        data-leaf="true"
        /* Hops from the root of this chain, so CSS and tests can address chain position
                   without re-deriving it. 0 for an unchained leaf. */
        data-chain-depth={chain.depthOf(props.id)}
        style={{
          ...(props.accent !== undefined ? { '--acc-accent': props.accent } : {}),
          ...(horizontal()
            ? { order: group.columnOrder(props.id) }
            : /* Past every panel (`order().length` is the highest panel order), in painted
                 sequence so chained leaves keep chain order. */
              { order: group.order().length + 1 + group.openIndex(props.id) }),
          ...sizeStyle(),
        }}
      >
        <Show when={props.title !== undefined}>
          <div class="acc-col-bar">
            <Show when={props.icon}>
              <span class="acc-icon">{props.icon}</span>
            </Show>
            <span class="acc-title">{props.title}</span>
            <div class="acc-header-tail">
              <Show when={props.actions}>
                <div class="acc-actions">{props.actions}</div>
              </Show>
              <Show when={props.closable ?? true}>
                <button
                  type="button"
                  class="acc-close"
                  data-no-drag
                  title="Close"
                  onClick={() => props.onClose?.()}
                >
                  <Close />
                </button>
              </Show>
            </div>
          </div>
        </Show>

        <div
          ref={setContentEl}
          id={contentId}
          class={`acc-content ${props.contentClass ?? ''}`.trim()}
        >
          {props.children}
        </div>

        <Splitter id={props.id} />
      </div>
    </Show>
  );
}
