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
   * CONTROLLED visibility. A leaf has no activator of its own, so its open state is
   * always the consumer's: it is the answer to a selection made in the columns
   * before it ("a file is selected → show the detail pane"), never a thing the user
   * toggles directly.
   *
   * A chained leaf (see `parentId`) is open only when BOTH this prop and its
   * parent say so — the prop is necessary, not sufficient.
   */
  open: boolean;

  /**
   * The panel or leaf this one hangs off, making it a link in a CHAIN rather than
   * a lone detail pane: `file → symbol → reference`.
   *
   * Naming a LEAF is the chained case and is what orders the columns. Naming a
   * PANEL is also legal and useful — "this detail pane belongs to the folder
   * column" — and gets the same cascade, because the only thing this prop asserts
   * is a dependency: when the parent is not open, neither is this.
   *
   * Omit it and the leaf behaves exactly as it always has: a terminal pane
   * depending on nothing.
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
  /** This leaf absorbs the group's leftover extent in `fill` mode — the same
   *  declaration `<AccordionPanel>` takes, and it must be honoured here too: a
   *  leaf is usually the trailing member, so if it ignored a sibling's
   *  declaration it would go on silently taking the surplus the consumer just
   *  promised to that sibling. See `AccordionPanelProps.grow`. */
  grow?: boolean;
  defaultSize?: AccordionDefaultSize;

  class?: string;
  contentClass?: string;
}

/**
 * A terminal detail pane at the end of the dock.
 *
 * This is the piece that turns the accordion into a MILLER-COLUMN browser: each
 * panel is a folder whose selection opens the next column, and the leaf is the file
 * at the end of the chain — a detail view, not another folder. It differs from a
 * panel in exactly four ways, all of which follow from "it has no activator":
 *
 *   1. No rail button and no clickable header (nothing to activate).
 *   2. Not reorderable — it is terminal by definition, so it is kept out of the
 *      user order entirely rather than being draggable into the middle.
 *   3. Exempt from `single`-policy auto-collapse. The leaf is the RESULT of the
 *      selection the user just made; collapsing it on the next click would destroy
 *      the thing that click produced.
 *   4. Controlled `open` — see the prop.
 *
 * It IS a first-class member for sizing: it resizes with a splitter and persists its
 * width like any column.
 *
 * TERMINAL IS NOT THE SAME AS LAST. A leaf may name a `parentId` and so become a
 * WAYPOINT in a chain — `file → symbol → reference` — while keeping every one of
 * the four properties above. Nothing in that list says "there is only one of me";
 * it says "I have no activator", and a chained leaf has no activator either. What
 * chaining adds is a dependency, and the two consequences below both fall out of
 * it rather than being separate features.
 */
export function AccordionLeaf(props: AccordionLeafProps): JSX.Element {
  const group = useAccordionGroup();
  const chain = leafChainFor(group);

  const baseId = createUniqueId();
  const contentId = `${baseId}-content`;
  /** Through a slot, so the reference is emptied when the leaf unmounts — a leaf
   *  mounts and unmounts constantly (it is the result of a selection), so a
   *  never-cleared ref here accumulates a detached node per selection. */
  const registerPanelEl = slotRef(group.panelElements, props.id);
  /** This leaf's own column + content elements. Signals, not the group's plain
   *  element map, because a size seeded from a measurement has to know WHEN the
   *  boxes arrive — and a leaf unmounts and remounts as it opens and closes. */
  const [panelEl, setPanelEl] = createSignal<HTMLElement | undefined>();
  const [contentEl, setContentEl] = createSignal<HTMLElement | undefined>();
  const afterPaint = createAfterPaint();
  const horizontal = (): boolean => group.orientation() === 'horizontal';

  /** Is the thing this leaf hangs off currently open? Vacuously true for an
   *  unchained leaf, which is what keeps the single-leaf case byte-for-byte the
   *  behaviour it always had. */
  const parentOpen = (): boolean => {
    const parent = props.parentId;
    return parent === undefined ? true : group.isOpen(parent);
  };

  /**
   * The leaf is open only when the consumer says so AND its parent is open.
   *
   * This is the CASCADE, and putting it here — in one derived accessor that gates
   * the render, the size and the group's open list together — is the whole answer
   * to "who enforces it". The alternative was to leave it to the consumer, which
   * fails for a structural reason rather than a diligence one: the consumer would
   * have to remember, at every place that can close a parent (the parent's ×, a
   * breadcrumb truncation, a selection change three columns upstream, a
   * `collapseAll`), to also clear every descendant's state. Every one of those
   * sites is a chance to produce the exact artefact this must never show — a
   * "references" column describing a symbol whose file is no longer open. A pane
   * that reads as current while describing something closed is not a cosmetic bug;
   * it is the UI asserting something false.
   *
   * Deriving it instead means there is no site to forget. The child cannot outlive
   * the parent because "open" is defined as "my parent is open and I was asked to
   * be", and depth is free: B hides when A closes, which hides C, and so on down.
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
        // How the group asks this leaf to close. Routed to the same `onClose` the
        // × button uses, so "the dock closed it" and "the user closed it" are one
        // path through the consumer rather than two with different effects.
        requestClose: () => props.onClose?.(),
      },
      false,
    );
    seedDefaultSize({
      defaultSize: () => props.defaultSize,
      open: effectiveOpen,
      // A leaf never flies out and never tears off — its children are always in
      // its own content element, so host and panel come from the same subtree.
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
   * Publish this leaf's place in the chain, in an effect rather than at mount, so
   * a `parentId` that changes re-links instead of leaving a stale edge behind.
   * The group sorts open leaves through this map — see `leafChain.ts` for why the
   * order cannot safely be inferred from the open list.
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
   * Mirror the EFFECTIVE open state into the group's open list, which drives
   * ordering, sizing and the splitter's neighbour lookup.
   *
   * `effectiveOpen()` and not `props.open`: the render gate below uses the same
   * accessor, and the two must not be able to disagree. A group that believes a
   * leaf is open while `<Show>` is not painting it leaves a column with a broken
   * flex `order` and a splitter that resizes against a pane nobody can see — the
   * same desync that stops the breadcrumb from closing a leaf through `setOpen`.
   */
  createEffect(() => {
    // `setLeafOpen`, not `setOpen`: this is the leaf REPORTING what it has decided,
    // and `setOpen` on a leaf is now a request that would come straight back here
    // as `requestClose` — the report would never reach the open list.
    group.setLeafOpen(props.id, effectiveOpen());
  });

  /**
   * Tell the consumer when the cascade fired, so the selection that opened this
   * leaf gets cleared.
   *
   * Reuses `onClose` rather than adding a second callback, because the two cases
   * ask for exactly the same thing: "the state behind this pane is no longer
   * valid, drop it." Without this the cascade would still LOOK right — the pane is
   * already hidden by `effectiveOpen` — but the consumer's signal would still hold
   * the old selection, and reopening the parent would resurrect a stale child.
   *
   * `defer` skips the mount pass: a leaf whose parent has not registered yet must
   * not read that as a close and fire on the consumer before anything happened.
   * `props.open` is read untracked so this fires on the PARENT's edge only, not
   * every time the consumer toggles the leaf itself.
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
    });
  };

  /*
   * A closed leaf UNMOUNTS, unlike a panel, which stays mounted and hidden.
   *
   * The asymmetry is deliberate and worth stating, because the panel's rule is
   * documented as a feature ("a scroll position, a text selection or an in-flight
   * edit inside a panel survives the user looking at a sibling") and a reader could
   * reasonably expect it here.
   *
   * A leaf is the RESULT of a selection made upstream — the references for a
   * symbol, the detail for a row. When it closes, the selection behind it is gone
   * (that is what `requestClose` and the cascade mean), so there is no state worth
   * preserving: restoring the scroll position of a pane describing a file the user
   * has navigated away from would be restoring a view of something that no longer
   * applies. Keeping it mounted would also keep whatever it renders alive —
   * subscriptions, timers, a fetch — for content nothing points at any more.
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
        /* Hops from the root of this chain. Present so CSS and tests can address
           chain position without re-deriving it; 0 for an unchained leaf, which is
           every leaf that existed before chaining. */
        data-chain-depth={chain.depthOf(props.id)}
        style={{
          ...(props.accent !== undefined ? { '--acc-accent': props.accent } : {}),
          ...(horizontal() ? { order: group.columnOrder(props.id) } : {}),
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
