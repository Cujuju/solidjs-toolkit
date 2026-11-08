import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { equalisedShares, resizedShares, type LayoutHandle, type ResizeSnap, type TileLayout, type TileLayoutOptions, type TileSize } from './layout';
import { ResizeHandle } from './ResizeHandle';
import { ResizeReadout, type ReadoutSide } from './ResizeReadout';
import { pushedLayout, PUSH_KEY_STEP_PX, type PushedLayout, type PushTarget } from './push';
import { handleCentre, nearestGuide, resizeGuides, type AlignLayout, type ResizeGuide } from './resizeGuides';
import { resizeSplit } from './tileEdits';
import { nodeAt, type TileNode, type TileSplit } from './tileTree';

/**
 * A trading drag's new shares for one split, or a pushing drag's whole tree and height. `holdPx` is the height the
 * pushing drag started at: the box keeps it until release, so a shrinking page never scrolls under the pointer.
 */
export type ResizeDraft = { split: TileSplit; sizes: number[] } | (PushedLayout & { holdPx: number }) | null;
const BOTTOM_KEY = 'bottom';

/** The dividers of a workspace, with the optional drag readout and guides to other layouts' dividers. */
export function ResizeLayer(props: {
  root: TileNode | undefined;
  layout: TileLayout;
  size: TileSize;
  draft: ResizeDraft;
  setDraft: (draft: ResizeDraft) => void;
  onChange: (next: TileNode, heightPx?: number) => void;
  /** Push mode: the height `layout` was computed at. Column dividers and a bottom-edge handle then push instead of trading. */
  pushHeightPx?: number;
  /** Push mode: the workspace never ends a drag shorter than this; the bottom tiles take up the difference. */
  pushFloorPx?: number;
  /** Layout options for another layout's tree, for its guides. */
  optionsFor: (root: TileNode) => TileLayoutOptions;
  readout?: boolean;
  color?: (id: string) => string;
  alignWith?: readonly AlignLayout[];
}) {
  let start: LayoutHandle | undefined;
  /** A pushing drag's target and the geometry it started from. */
  let pushStart: { target: PushTarget; root: TileNode; layout: TileLayout; heightPx: number } | undefined;
  let guides: ResizeGuide[] = [];
  const [readout, setReadout] = createSignal<{ key: string; side: ReadoutSide; alignedWith?: string } | null>(null);

  const cancel = () => { start = undefined; pushStart = undefined; guides = []; props.setDraft(null); setReadout(null); };
  const valid = () => (pushStart ? props.root === pushStart.root : !!start && !!props.root && nodeAt(props.root, start.path) === start.split);
  const commit = () => {
    const pending = props.draft;
    if (valid() && pending) {
      if ('heightPx' in pending) props.onChange(pending.root, pending.heightPx);
      else props.onChange(resizeSplit(props.root!, start!.path, pending.sizes));
    }
    cancel();
  };
  const beginPush = (target: PushTarget) => {
    cancel();
    if (props.root && props.pushHeightPx !== undefined) pushStart = { target, root: props.root, layout: props.layout, heightPx: props.pushHeightPx };
  };
  const draftPush = (delta: number, snap: ResizeSnap) => {
    if (!valid()) return cancel();
    const { target, root, layout, heightPx } = pushStart!;
    const px = snap.kind === 'by' ? Math.sign(snap.steps) * PUSH_KEY_STEP_PX : delta;
    props.setDraft(px ? { ...pushedLayout(root, layout, { width: props.size.width, height: heightPx }, target, px, props.optionsFor(root), props.pushFloorPx), holdPx: heightPx } : null);
  };
  onMount(() => {
    // Shift moves the readout to the divider's other side.
    const flip = (event: KeyboardEvent) => {
      if (event.key === 'Shift' && !event.repeat) setReadout((current) => current && { ...current, side: current.side === 'a' ? 'b' : 'a' });
    };
    window.addEventListener('keydown', flip);
    onCleanup(() => window.removeEventListener('keydown', flip));
  });

  const readoutView = createMemo(() => {
    const current = readout();
    const handle = current && props.layout.handles.find((entry) => entry.key === current.key);
    if (!current || !handle) return null;
    const pending = props.draft;
    const shares = pending && 'split' in pending && pending.split === handle.split ? pending.sizes : handle.split.sizes;
    return { handle, side: current.side, alignedWith: current.alignedWith, shares };
  });

  return (
    <>
      <For each={props.layout.handles.map((handle) => handle.key)}>
        {(key) => {
          const handle = () => props.layout.handles.find((entry) => entry.key === key);
          const pushes = () => props.pushHeightPx !== undefined && handle()?.split.dir === 'column';
          return (
            <Show when={handle()}>
              {(current) => (
                <Show when={!pushes()} fallback={
                  <ResizeHandle dir="column" rect={current().rect} autoScroll
                    onBegin={() => beginPush({ path: current().path, gap: current().gap })}
                    onDraft={draftPush} onCommit={commit} onCancel={cancel}
                    onEqualise={() => props.root && props.onChange(resizeSplit(props.root, current().path, equalisedShares(current())))} />
                }>
                <ResizeHandle
                  dir={current().split.dir}
                  rect={current().rect}
                  onBegin={(pointer) => {
                    cancel();
                    start = current();
                    if (!pointer) return;
                    if (props.readout) {
                      // The side is fixed here so the readout does not jump when the two panes cross in size.
                      const axis = start.split.dir === 'row' ? 'width' : 'height';
                      setReadout({ key, side: start.childRects[start.a][axis] >= start.childRects[start.b][axis] ? 'a' : 'b' });
                    }
                    guides = props.alignWith ? resizeGuides(props.alignWith, start, props.size, props.optionsFor) : [];
                  }}
                  onDraft={(delta, snap) => {
                    if (!valid()) return cancel();
                    const initial = start!;
                    if (snap.kind !== 'by' && delta === 0) return props.setDraft(null);
                    // A nearby divider in another layout beats the step grid, so the two line up exactly.
                    const guide = snap.kind === 'nearest' ? nearestGuide(guides, handleCentre(initial) + delta) : undefined;
                    const move: [number, ResizeSnap] = guide ? [guide.positionPx - handleCentre(initial), { kind: 'free' }] : [delta, snap];
                    setReadout((shown) => shown && { ...shown, alignedWith: guide?.name });
                    props.setDraft({ split: initial.split, sizes: resizedShares(initial, ...move) });
                  }}
                  onCommit={commit}
                  onCancel={cancel}
                  onEqualise={() => props.root && props.onChange(resizeSplit(props.root, current().path, equalisedShares(current())))}
                />
                </Show>
              )}
            </Show>
          );
        }}
      </For>
      <Show when={props.pushHeightPx !== undefined && props.root}>
        <ResizeHandle dir="column" autoScroll label="Resize the bottom tiles"
          rect={{ x: 0, y: props.pushHeightPx!, width: props.size.width, height: props.optionsFor(props.root!).gapPx }}
          onBegin={() => beginPush(BOTTOM_KEY)} onDraft={draftPush} onCommit={commit} onCancel={cancel} onEqualise={() => undefined} />
      </Show>
      <Show when={readoutView()}>
        {(view) => <ResizeReadout handle={view().handle} shares={view().shares} side={view().side} alignedWith={view().alignedWith} color={props.color} />}
      </Show>
    </>
  );
}
