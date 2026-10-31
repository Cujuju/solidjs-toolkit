import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  useContext,
  type JSX,
} from 'solid-js';
import type { AccordionGroupProps } from './AccordionGroup.types';
import { createAutoHide, type AutoHideApi } from './autoHide';
import {
  AccordionGroupContext,
  type AccordionAppearance,
  type AccordionMode,
  type AccordionOpenPlacement,
  type AccordionOrientation,
  type AccordionPolicy,
  type AccordionRailSide,
  type PanelMeta,
} from './context';
import { createGroupActions } from './groupActions';
import { createGroupApi } from './groupApi';
import { createGroupInteractions } from './groupInteractions';
import { createGroupOrder } from './groupOrder';
import { createGroupState } from './groupState';
import { bindLeafChain } from './leafChain';
import { RailButton } from './RailButton';
import { createRailOverflow } from './railOverflow';
import { RailOverflowMenu } from './RailOverflowMenu';
import { createRailPan } from './railPan';
import { createTearOff, type TearOffController } from './tearOff';
import { showsRailButton } from './visualOrder';

export type { AccordionGroupProps } from './AccordionGroup.types';

/**
 * Drag activation is skipped on anything matching this. The primitive's default would disable
 * dragging entirely, because the rail ACTIVATOR IS a `<button>` — so the skip is inverted.
 */
const REORDER_SKIP_SELECTOR = '[data-no-drag]';

/** Shared empty array for the torn-off accessor before the controller exists.
 *  A fresh `[]` per call would be a new identity every read and defeat memo
 *  equality downstream. */
const EMPTY_IDS: readonly string[] = [];

export function AccordionGroup(props: AccordionGroupProps): JSX.Element {
  const orientation = (): AccordionOrientation => props.orientation ?? 'vertical';
  const railSide = (): AccordionRailSide => props.railSide ?? 'left';
  const appearance = (): AccordionAppearance => props.appearance ?? 'flush';
  const mode = (): AccordionMode => props.mode ?? 'natural';
  const policy = (): AccordionPolicy => props.policy ?? 'single';
  const openPlacement = (): AccordionOpenPlacement => props.openPlacement ?? 'in-order';
  const reorderable = (): boolean => props.reorderable ?? true;
  const resizable = (): boolean => props.resizable ?? true;

  const parent = useContext(AccordionGroupContext);
  const depth = parent === undefined ? 0 : parent.depth + 1;

  const state = createGroupState({ props });
  const { openList, pinned, panels, refocusPending, setRefocusPending, metaOf } = state;

  const order = createGroupOrder({ ...state, orientation, props });
  const { railDivider, railOrder, flyoutState, leafChain } = order;

  const actions = createGroupActions({
    ...state,
    ...order,
    props,
    openPlacement,
    policy,
  });

  const interactions = createGroupInteractions({
    ...state,
    ...order,
    ...actions,
    getRailOverflow: () => railOverflow,
    orientation,
    railSide,
    REORDER_SKIP_SELECTOR,
  });
  const { resize } = interactions;

  const [railEl, setRailEl] = createSignal<HTMLElement | undefined>();
  const overflowStrategy = (): 'menu' | 'pan' => props.railOverflow ?? 'menu';

  /**
   * Built BEFORE `api`, which genuinely depends on it: `activatorElOf` has to know whether a
   * panel's button collapsed into the `⋯` menu. Its own inputs are all available here.
   */
  /** The panels the rail is actually serving. See DESIGN_NOTES.md § src/AccordionGroup.tsx:735. */
  const railServedIds = createMemo<readonly string[]>(() =>
    panels()
      .map((m) => m.id)
      .filter((id) =>
        showsRailButton(id, {
          isOpen: (v) => openList().includes(v),
          isPinned: (v) => pinned().has(v),
          enabled: railDivider(),
        }),
      ),
  );

  const railOverflow = createRailOverflow({
    railEl,
    ids: railServedIds,
    enabled: () => orientation() === 'horizontal' && overflowStrategy() === 'menu',
  });

  /** The rail `tablist`'s single Tab stop: the last-focused tab still on the rail, else the first open, else the first. */
  const [railFocusId, setRailFocusId] = createSignal<string | undefined>();
  const railTabStopId = createMemo<string | undefined>(() => {
    const visible = railOverflow.visibleIds();
    const focused = railFocusId();
    if (focused !== undefined && visible.includes(focused)) return focused;
    return visible.find((id) => openList().includes(id)) ?? visible[0];
  });

  /**
   * Late-bound: `createAutoHide` needs the finished `api`, and `api` needs the auto-hide
   * answers. A mutable reference read through a closure is the smaller lie than a
   * half-populated api object.
   */
  const controllers: { autoHideApi?: AutoHideApi; tearOffApi?: TearOffController } = {};

  const result = createGroupApi({
    ...state,
    ...order,
    ...actions,
    ...interactions,
    orientation,
    railSide,
    mode,
    policy,
    reorderable,
    resizable,
    depth,
    railOverflow,
    controllers,
    EMPTY_IDS,
    props,
  });
  const { api } = result;

  /**
   * Hands focus dropped by a latched release to the panel's stand-in (e.g. the `⋯`
   * trigger). Never acts without the latch; drops it once no stand-in can arrive.
   */
  createEffect(() => {
    const focused = refocusPending();
    if (focused === undefined) return;
    // Someone claimed the dropped focus first; the latch is stale, not a mandate.
    if (document.activeElement !== document.body) {
      setRefocusPending(undefined);
      return;
    }
    // The stand-in resolves a cycle late: `overflowIds` and the trigger's own ref
    // settle after the button leaves the rail. Stay latched and retry on that change.
    const el = api.activatorElOf(focused);
    if (el === undefined) {
      // A removed panel never gets a stand-in; left latched, its remount would take focus.
      if (api.meta(focused) === undefined) setRefocusPending(undefined);
      return;
    }
    setRefocusPending(undefined);
    el.focus();
  });

  createRailPan({
    railEl,
    group: api,
    // Mutually exclusive by construction: under `menu` the rail never overflows, so there is
    // nothing to pan and the listeners are not attached at all.
    enabled: () => orientation() === 'horizontal' && overflowStrategy() === 'pan',
  });

  const autoHide: AutoHideApi = createAutoHide({
    group: api,
    enabled: () => props.autoHide === true,
    hoverToOpen: () => props.hoverToOpen === true,
    hoverOpenDelayMs: () => props.hoverOpenDelayMs,
  });

  controllers.autoHideApi = autoHide;
  // Closes the late-binding described at `isFlyoutId`'s declaration. From here on
  // `visualOpenIds` sees flyouts for what they are — overlays, not columns.
  flyoutState.isFlyoutId = (id) => autoHide.isFlyout(id);

  /** Publish the chain against the finished api, the only handle a leaf and its group both hold. See DESIGN_NOTES.md § src/AccordionGroup.tsx:1111. */
  bindLeafChain(api, leafChain);

  controllers.tearOffApi = createTearOff({
    // The OS window chrome is a torn-off panel's ONLY label, so a non-string title must degrade
    // to something identifiable rather than "[object Object]". The id is the honest fallback.
    titleOf: (id) => {
      const title = metaOf(id)?.title();
      return typeof title === 'string' ? title : id;
    },
    storageKey:
      props.storageKey === undefined ? undefined : `${props.storageKey}:tearoff`,
    onTearOff: (id) => props.onTearOff?.(id),
    onDock: (id) => props.onDock?.(id),
    onError: (id, reason) => props.onTearOffError?.(id, reason),
  });

  props.apiRef?.(api);

  return (
    <AccordionGroupContext.Provider value={api}>
      <div
        class={`acc-group ${props.class ?? ''}`.trim()}
        data-orientation={orientation()}
        data-rail-side={railSide()}
        data-mode={mode()}
        /* Chrome only — every rule keyed off this lives in `styles.css`, and no
           behaviour anywhere branches on it. */
        data-appearance={appearance()}
        data-policy={policy()}
        data-density={props.density ?? 'comfortable'}
        data-animated={props.animated ? 'true' : 'false'}
        data-depth={depth}
        data-resizing={resize.resizing() ? 'true' : 'false'}
        data-collapse-candidate={resize.collapseCandidate() ?? undefined}
        role="region"
        aria-label={props.ariaLabel}
        style={props.height !== undefined ? { height: props.height } : undefined}
      >
        {/* The rail exists only in `horizontal`, and the GROUP owns it, not the panels: every
                    activator lives in ONE stacked strip regardless of where its column is. */}
        <Show when={orientation() === 'horizontal'}>
          <div
            ref={setRailEl}
            class="acc-rail"
            /* The rail's slot is COMPUTED under the divider, sitting after the static columns.
                           Written as a style so the one number the layout turns on has a single source. */
            style={railDivider() ? { order: railOrder() } : undefined}
            /* Everything is pinned: nothing is left for the rail to serve, so it
               collapses to zero width rather than leaving a dead strip between
               the static columns and the leaf. */
            data-rail-empty={
              railDivider() &&
              railOverflow.visibleIds().length === 0 &&
              !railOverflow.hasOverflow()
                ? 'true'
                : 'false'
            }
            role="tablist"
            aria-orientation="vertical"
            /* Under `multi` several tabs are selected at once, which a plain tablist does
                           not allow — a reader announcing two selected tabs is being told
                           something contradictory. */
            aria-multiselectable={policy() === 'multi' ? 'true' : undefined}
            /* NAME MUST MATCH `rail.css`, which selects `data-overflow-mode`. See DESIGN_NOTES.md § src/AccordionGroup.tsx:1186. */
            data-overflow-mode={overflowStrategy()}
          >
            <For each={railOverflow.visibleIds()}>
              {(id) => {
                const meta = (): PanelMeta | undefined => api.meta(id);
                return (
                  <Show when={meta()}>
                    {(m) => (
                      <RailButton
                        group={api}
                        meta={m()}
                        autoHide={autoHide}
                        tabStop={() => railTabStopId() === id}
                        onTabFocus={() => setRailFocusId(id)}
                      />
                    )}
                  </Show>
                );
              }}
            </For>
            <Show when={railOverflow.hasOverflow()}>
              <RailOverflowMenu
                group={api}
                ids={railOverflow.overflowIds}
                onMeasure={railOverflow.setTriggerExtent}
              />
            </Show>
          </div>
        </Show>

        {props.children}

        {/* Soaks up the leftover space when nothing is open, so the header stack sits
                    flush at the start of the group instead of being stretched apart. */}
        <div class="acc-filler" aria-hidden="true" />

        {/* Every open flyout's popover lives here. Rendered once, inside the group,
            so it inherits the group's token scope for anything not portalled. */}
        {autoHide.element}
      </div>
    </AccordionGroupContext.Provider>
  );
}
