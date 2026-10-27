import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { equalisedShares, resizedShares, type LayoutHandle, type ResizeSnap, type TileLayout, type TileLayoutOptions, type TileSize } from './layout';
import { ResizeHandle } from './ResizeHandle';
import { ResizeReadout, type ReadoutSide } from './ResizeReadout';
import { handleCentre, nearestGuide, resizeGuides, type AlignLayout, type ResizeGuide } from './resizeGuides';
import { resizeSplit } from './tileEdits';
import { nodeAt, type TileNode, type TileSplit } from './tileTree';

export type ResizeDraft = { split: TileSplit; sizes: number[] } | null;

/** The dividers of a workspace, with the optional drag readout and guides to other layouts' dividers. */
export function ResizeLayer(props: {
  root: TileNode | undefined;
  layout: TileLayout;
  size: TileSize;
  draft: ResizeDraft;
  setDraft: (draft: ResizeDraft) => void;
  onChange: (next: TileNode) => void;
  /** Layout options for another layout's tree, for its guides. */
  optionsFor: (root: TileNode) => TileLayoutOptions;
  readout?: boolean;
  color?: (id: string) => string;
  alignWith?: readonly AlignLayout[];
}) {
  let start: LayoutHandle | undefined;
  let guides: ResizeGuide[] = [];
  const [readout, setReadout] = createSignal<{ key: string; side: ReadoutSide; alignedWith?: string } | null>(null);

  const cancel = () => { start = undefined; guides = []; props.setDraft(null); setReadout(null); };
  const valid = () => !!start && !!props.root && nodeAt(props.root, start.path) === start.split;
  const commit = () => {
    const pending = props.draft;
    if (valid() && pending) props.onChange(resizeSplit(props.root!, start!.path, pending.sizes));
    cancel();
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
    return { handle, side: current.side, alignedWith: current.alignedWith, shares: pending?.split === handle.split ? pending.sizes : handle.split.sizes };
  });

  return (
    <>
      <For each={props.layout.handles.map((handle) => handle.key)}>
        {(key) => {
          const handle = () => props.layout.handles.find((entry) => entry.key === key);
          return (
            <Show when={handle()}>
              {(current) => (
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
              )}
            </Show>
          );
        }}
      </For>
      <Show when={readoutView()}>
        {(view) => <ResizeReadout handle={view().handle} shares={view().shares} side={view().side} alignedWith={view().alignedWith} color={props.color} />}
      </Show>
    </>
  );
}
