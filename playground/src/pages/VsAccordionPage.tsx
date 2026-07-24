import { For, createEffect, createSignal, type JSX } from 'solid-js';
import {
  AccordionGroup,
  AccordionLeaf,
  AccordionPanel,
  useAccordionGroup,
  type AccordionGroupApi,
  type AccordionRailSide,
  DEFAULT_MIN_SIZE_PX,
} from '../mock/vs-accordion';
import { Card, Code, EventLog, createEventLog } from '../ui';

/**
 * MOCK PAGE — vs-accordion is not a package yet (it lives in playground/src/mock/).
 * This page is the design surface: it exists to answer the two questions the mock
 * was built to answer — does `fill` or `natural` sizing feel right, and does the
 * pin read as "exempt from auto-collapse" without being explained.
 */

function Rows(props: { n: number; label?: string }): JSX.Element {
  return (
    <div class="readout" style={{ padding: '4px 6px' }}>
      <For each={Array.from({ length: props.n }, (_, i) => i + 1)}>
        {(i) => <div>{props.label ?? 'row'} {i}</div>}
      </For>
    </div>
  );
}

/** Fake tree for the Miller-column demo. */
const FOLDERS = [
  { name: 'components', files: ['AppShell.tsx', 'Panel.tsx', 'Rail.tsx'] },
  { name: 'hooks', files: ['useDock.ts', 'useResize.ts'] },
  { name: 'utils', files: ['format.ts', 'clamp.ts', 'ids.ts', 'dates.ts'] },
];

/** Selectable row list — the "folder contents" of a Miller column. */
function PickList(props: {
  items: string[];
  selected: string | null;
  onPick: (name: string) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px' }}>
      <For each={props.items}>
        {(name) => (
          <button
            class="demo-btn"
            data-active={props.selected === name ? '' : undefined}
            style={{ 'text-align': 'left', 'justify-content': 'flex-start' }}
            onClick={() => props.onPick(name)}
          >
            {name}
          </button>
        )}
      </For>
    </div>
  );
}

/** Group-level controls, rendered INSIDE the group so they can reach its context.
 *  Doubles as the demo of `useAccordionGroup` for consumers building their own. */
function GroupToolbar(): JSX.Element {
  const group = useAccordionGroup();
  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        padding: '6px 8px',
        'border-top': '1px solid var(--vsa-border)',
        flex: '0 0 auto',
      }}
    >
      <button class="demo-btn" onClick={() => group.collapseAll()}>
        collapse all
      </button>
      <button
        class="demo-btn"
        disabled={group.policy() === 'single'}
        title={
          group.policy() === 'single'
            ? 'no-op under policy="single" — an accordion cannot have all panels open'
            : undefined
        }
        onClick={() => group.expandAll()}
      >
        expand all
      </button>
    </div>
  );
}

export function VsAccordionPage(): JSX.Element {
  const log = createEventLog();

  /** Captured via `apiRef` — drives the collapse/expand buttons that sit OUTSIDE the
   *  horizontal group, where `useAccordionGroup()` cannot reach. */
  let natApi: AccordionGroupApi | undefined;

  const [railSide, setRailSide] = createSignal<AccordionRailSide>('left');

  const [folder, setFolder] = createSignal<string | null>(null);
  const [file, setFile] = createSignal<string | null>(null);
  const files = (): string[] => FOLDERS.find((f) => f.name === folder())?.files ?? [];

  /** The files column has no leaf-style controlled `open`, so the selection drives it
   *  through the group API — this is the wiring a real Miller browser owns. */
  let millerApi: AccordionGroupApi | undefined;
  createEffect(() => {
    millerApi?.setOpen('mc-files', folder() !== null);
  });

  return (
    <>
      <h1>vs-accordion <span class="readout">MOCK — not a package yet</span></h1>
      <p class="note">
        A Visual Studio style dock: a stack of collapsible panels where opening one
        auto-collapses its siblings (<code>policy="single"</code>) — except the ones
        you have <b>pinned</b>. The pin is the whole idea: it exempts a panel from the
        accordion's auto-collapse and from <code>collapseAll()</code>, so you can keep
        two or three panels permanently open and let the rest take turns in the
        remaining space.
      </p>

      <Code cap="usage">{`
import { AccordionGroup, AccordionPanel } from './mock/vs-accordion';

<AccordionGroup mode="fill" policy="single" height="420px" storageKey="app:dock">
  <AccordionPanel id="solution" title="Solution Explorer" defaultOpen>
    <Tree />
  </AccordionPanel>
  <AccordionPanel id="props" title="Properties" count={12}>
    <PropertyGrid />
  </AccordionPanel>
  <AccordionPanel id="output" title="Output" pinnable={false}>
    <Log />
  </AccordionPanel>
</AccordionGroup>

// Same panels, sidebar-style: collapsed ones become buttons in a left rail,
// open ones expand out to the right in the order they were opened.
<AccordionGroup orientation="horizontal" mode="fill" height="360px">
  ...same children...
</AccordionGroup>
`}</Code>

      <h2>Sizing — the choice to make</h2>
      <p class="note">
        Same panels, same policy, two sizing models. <code>fill</code> is the real VS
        dock (fixed group height, open panels split the leftover space, collapsed ones
        are just their header bar). <code>natural</code> is the familiar disclosure
        stack (each open panel is as tall as its content; the container scrolls).
      </p>

      <div class="row">
        <Card cap='mode="fill" — fixed 420px dock'>
          <div style={{ width: '300px' }}>
            <AccordionGroup
              mode="fill"
              policy="single"
              height="420px"
              ariaLabel="Fill-mode dock"
              onChange={(id, open) => log.log(open ? 'open' : 'close', id)}
              onPinChange={(id, pinned) => log.log(pinned ? 'pin' : 'unpin', id)}
            >
              <AccordionPanel id="solution" title="Solution Explorer" count={7} defaultOpen>
                <Rows n={10} label="file" />
              </AccordionPanel>
              <AccordionPanel id="props" title="Properties" count={12}>
                <Rows n={12} label="prop" />
              </AccordionPanel>
              <AccordionPanel id="toolbox" title="Toolbox">
                <Rows n={8} label="tool" />
              </AccordionPanel>
              <AccordionPanel id="output" title="Output" pinnable={false}>
                <Rows n={14} label="line" />
              </AccordionPanel>
              <GroupToolbar />
            </AccordionGroup>
            <p class="note">
              Pin <b>Solution Explorer</b>, then open <b>Toolbox</b> — the pinned panel
              keeps its share of the height instead of collapsing. <b>Output</b> is
              <code> pinnable=false</code>, so it always obeys.
            </p>
          </div>
        </Card>

        <Card cap='mode="natural" — content height, container scrolls'>
          <div style={{ width: '300px' }}>
            <div style={{ 'max-height': '420px', overflow: 'auto' }}>
              <AccordionGroup
                mode="natural"
                policy="single"
                ariaLabel="Natural-mode stack"
                onChange={(id, open) => log.log(open ? 'open' : 'close', `natural:${id}`)}
                onPinChange={(id, pinned) => log.log(pinned ? 'pin' : 'unpin', `natural:${id}`)}
              >
                <AccordionPanel id="n-solution" title="Solution Explorer" count={7} defaultOpen>
                  <Rows n={10} label="file" />
                </AccordionPanel>
                <AccordionPanel id="n-props" title="Properties" count={12}>
                  <Rows n={12} label="prop" />
                </AccordionPanel>
                <AccordionPanel id="n-toolbox" title="Toolbox">
                  <Rows n={8} label="tool" />
                </AccordionPanel>
                <AccordionPanel id="n-output" title="Output">
                  <Rows n={14} label="line" />
                </AccordionPanel>
              </AccordionGroup>
            </div>
            <p class="note">
              The scroll container is the CONSUMER's, not the group's — pin two panels
              here and the stack simply gets taller.
            </p>
          </div>
        </Card>
      </div>

      <h2>Horizontal — rail on one edge, columns grow away from it</h2>
      <p class="note">
        <code>orientation="horizontal"</code>. Every panel gets a button in the rail,
        stacked below the one before it, label rotated. Click one and its column expands
        out from the rail; columns sit <b>in the order you opened them</b>, not
        declaration order. The rail button keeps the accent stripe while its column is
        open, and shows a pin glyph when pinned. Pinning works exactly as it does
        vertically: a pinned column survives the next panel being opened.
      </p>
      <p class="note">
        <code>railSide</code> docks the rail to either edge and the columns always grow
        AWAY from it — rail left, columns run left-to-right; rail right, they mirror and
        run right-to-left, so a panel always appears to come out of its own button. The
        open ORDER is identical either way; only the reading direction flips.
      </p>

      <div class="row">
        <Card cap='horizontal + fill — columns split the width' wide>
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px' }}>
              <button
                class="demo-btn"
                data-active={railSide() === 'left' ? '' : undefined}
                onClick={() => setRailSide('left')}
              >
                rail left
              </button>
              <button
                class="demo-btn"
                data-active={railSide() === 'right' ? '' : undefined}
                onClick={() => setRailSide('right')}
              >
                rail right
              </button>
            </div>
            <AccordionGroup
              orientation="horizontal"
              railSide={railSide()}
              mode="fill"
              policy="single"
              height="360px"
              storageKey="playground:vsa:rail"
              ariaLabel="Horizontal rail dock"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `rail:${id}`)}
              onPinChange={(id, pinned) => log.log(pinned ? 'pin' : 'unpin', `rail:${id}`)}
            >
              <AccordionPanel id="r-solution" title="Solution Explorer" count={7} defaultOpen>
                <Rows n={12} label="file" />
              </AccordionPanel>
              <AccordionPanel id="r-props" title="Properties" count={12}>
                <Rows n={12} label="prop" />
              </AccordionPanel>
              <AccordionPanel id="r-toolbox" title="Toolbox">
                <Rows n={10} label="tool" />
              </AccordionPanel>
              <AccordionPanel id="r-errors" title="Error List" count={3}>
                <Rows n={6} label="error" />
              </AccordionPanel>
              <AccordionPanel id="r-output" title="Output" pinnable={false}>
                <Rows n={14} label="line" />
              </AccordionPanel>
            </AccordionGroup>
            <p class="note">
              Pin two, open a third — the pinned columns hold their slots and the new one
              lands to their right. Collapse everything and you are left with just the
              rail, which is the sidebar-collapse behaviour. Persisted, so a reload keeps
              both the open set and the order.
            </p>
          </div>
        </Card>
      </div>

      <div class="row">
        <Card cap='horizontal + multi + natural — fixed-width columns, group scrolls' wide>
          <div style={{ width: '100%', overflow: 'auto' }}>
            <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px' }}>
              <button class="demo-btn" onClick={() => natApi?.collapseAll()}>
                collapse all
              </button>
              <button class="demo-btn" onClick={() => natApi?.expandAll()}>
                expand all
              </button>
            </div>
            <AccordionGroup
              apiRef={(a) => (natApi = a)}
              orientation="horizontal"
              mode="natural"
              policy="multi"
              height="300px"
              ariaLabel="Horizontal natural dock"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `railnat:${id}`)}
              onPinChange={(id, pinned) => log.log(pinned ? 'pin' : 'unpin', `railnat:${id}`)}
            >
              <AccordionPanel id="rn-a" title="Watchlist" count={5} defaultOpen>
                <Rows n={8} label="sym" />
              </AccordionPanel>
              <AccordionPanel id="rn-b" title="Positions" count={2}>
                <Rows n={8} label="pos" />
              </AccordionPanel>
              <AccordionPanel id="rn-c" title="Orders">
                <Rows n={8} label="ord" />
              </AccordionPanel>
              <AccordionPanel id="rn-d" title="Chain">
                <Rows n={8} label="strike" />
              </AccordionPanel>
            </AccordionGroup>
            <p class="note">
              <code>policy="multi"</code> here, so open as many as you like — each column
              is a fixed <code>--vsa-col-width</code> and the group scrolls sideways once
              they overflow. This is the variant where open-ORDER is easiest to see.
            </p>
          </div>
        </Card>
      </div>

      <h2>Miller columns — folders, then a headless leaf</h2>
      <p class="note">
        The dock used as a <b>browser</b>: pick a row in one column and the next column
        opens to its side; pick a FILE at the end and an <code>&lt;AccordionLeaf&gt;</code>
        opens — a terminal detail pane with no rail button, not reorderable, and exempt
        from the accordion's auto-collapse (it is the result of the selection, so
        collapsing it on the next click would destroy what the click produced). It still
        resizes and persists its width like any column.
      </p>
      <div class="row">
        <Card cap="click a folder → a file → the detail leaf" wide>
          <div style={{ width: '100%' }}>
            <AccordionGroup
              orientation="horizontal"
              mode="natural"
              policy="multi"
              height="330px"
              reorderable={false}
              apiRef={(a) => (millerApi = a)}
              ariaLabel="Miller column browser"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `miller:${id}`)}
            >
              <AccordionPanel id="mc-root" title="src" icon="📁" count={FOLDERS.length} defaultOpen>
                <PickList
                  items={FOLDERS.map((f) => f.name)}
                  selected={folder()}
                  onPick={(name) => {
                    setFolder(name);
                    setFile(null);
                  }}
                />
              </AccordionPanel>

              <AccordionPanel
                id="mc-files"
                title={folder() ?? 'files'}
                icon="📁"
                count={files().length}
                accent="#f59e0b"
              >
                <PickList items={files()} selected={file()} onPick={setFile} />
              </AccordionPanel>

              <AccordionLeaf
                id="mc-detail"
                open={file() !== null}
                title={file() ?? ''}
                icon="📄"
                accent="#10b981"
                defaultSize={260}
                onClose={() => setFile(null)}
              >
                <div class="readout" style={{ padding: '6px 8px', 'line-height': '1.7' }}>
                  <div><b>{file()}</b></div>
                  <div>path — src/{folder()}/{file()}</div>
                  <div>size — 4.2 kB</div>
                  <div>modified — 2 hours ago</div>
                  <div>this pane is the LEAF: no rail button, always last</div>
                </div>
              </AccordionLeaf>
            </AccordionGroup>
            <p class="note">
              Selecting a folder opens the files column; selecting a file opens the leaf.
              Close the leaf with its × — the consumer owns its <code>open</code>, so the
              close handler is what clears the selection.
            </p>
          </div>
        </Card>
      </div>

      <h2>Customisation — icons, accents, labels, sizes</h2>
      <p class="note">
        Every panel takes <code>icon</code>, <code>railLabel</code> (a shorter string for
        the rotated rail button), <code>tooltip</code>, <code>accent</code> (recolours
        that panel's rail marker, pin and focus ring — it just sets
        <code> --vsa-accent</code> on the subtree), <code>minSize</code>,
        <code> defaultSize</code>, <code>closable</code>, <code>lazyMount</code>, plus
        <code> class</code> / <code>headerClass</code> / <code>contentClass</code> /
        <code> railClass</code> / <code>style</code> hooks.
      </p>
      <div class="row">
        <Card cap="per-panel icon + accent + railLabel" wide>
          <div style={{ width: '100%' }}>
            <AccordionGroup
              orientation="horizontal"
              mode="fill"
              policy="multi"
              height="300px"
              ariaLabel="Customisation demo"
            >
              <AccordionPanel
                id="c-a"
                title="Positions"
                railLabel="POS"
                icon="📈"
                accent="#10b981"
                tooltip="Open positions"
                count={4}
                minSize={160}
                defaultOpen
              >
                <Rows n={6} label="pos" />
              </AccordionPanel>
              <AccordionPanel
                id="c-b"
                title="Risk"
                railLabel="RISK"
                icon="⚠"
                accent="#f59e0b"
                tooltip="Risk console"
              >
                <Rows n={6} label="greek" />
              </AccordionPanel>
              <AccordionPanel
                id="c-c"
                title="Alerts"
                railLabel="ALRT"
                icon="🔔"
                accent="#ef4444"
                count={2}
                lazyMount
              >
                <Rows n={6} label="alert" />
              </AccordionPanel>
            </AccordionGroup>
          </div>
        </Card>
      </div>

      <h2>Levels — nested groups, each with its own accordion + pins</h2>
      <div class="row">
        <Card cap="fill mode, two levels deep">
          <div style={{ width: '340px' }}>
            <AccordionGroup
              mode="fill"
              policy="single"
              height="440px"
              storageKey="playground:vsa:nested"
              ariaLabel="Nested dock"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `L0:${id}`)}
              onPinChange={(id, pinned) => log.log(pinned ? 'pin' : 'unpin', `L0:${id}`)}
            >
              <AccordionPanel id="explorer" title="Solution Explorer" defaultOpen>
                <AccordionGroup
                  mode="fill"
                  policy="single"
                  storageKey="playground:vsa:nested:explorer"
                  ariaLabel="Explorer sub-sections"
                  onChange={(id, open) => log.log(open ? 'open' : 'close', `L1:${id}`)}
                  onPinChange={(id, pinned) => log.log(pinned ? 'pin' : 'unpin', `L1:${id}`)}
                >
                  <AccordionPanel id="src" title="src" count={24} defaultOpen>
                    <Rows n={6} label="module" />
                  </AccordionPanel>
                  <AccordionPanel id="tests" title="tests" count={9}>
                    <Rows n={6} label="spec" />
                  </AccordionPanel>
                  <AccordionPanel id="assets" title="assets" count={41}>
                    <Rows n={6} label="asset" />
                  </AccordionPanel>
                </AccordionGroup>
              </AccordionPanel>

              <AccordionPanel id="team" title="Team Explorer">
                <Rows n={6} label="branch" />
              </AccordionPanel>

              <AccordionPanel id="errors" title="Error List" count={3}>
                <Rows n={6} label="error" />
              </AccordionPanel>
            </AccordionGroup>
            <p class="note">
              The inner group is a full accordion in its own right — its own single-open
              policy, its own pins, its own <code>storageKey</code>. Persisted here, so
              reload the page to see both levels come back.
            </p>
          </div>
        </Card>

        <Card cap='policy="multi" — pins still gate collapse-all'>
          <div style={{ width: '300px' }}>
            <AccordionGroup
              mode="natural"
              policy="multi"
              ariaLabel="Multi-open group"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `multi:${id}`)}
              onPinChange={(id, pinned) => log.log(pinned ? 'pin' : 'unpin', `multi:${id}`)}
            >
              <AccordionPanel id="m-a" title="Watch 1" defaultOpen>
                <Rows n={3} label="sym" />
              </AccordionPanel>
              <AccordionPanel id="m-b" title="Watch 2" defaultOpen>
                <Rows n={3} label="sym" />
              </AccordionPanel>
              <AccordionPanel id="m-c" title="Locals">
                <Rows n={3} label="var" />
              </AccordionPanel>
              <GroupToolbar />
            </AccordionGroup>
            <p class="note">
              Nothing auto-collapses here, so the pin's ONLY job is to survive
              <code> collapse all</code>. Pin one, hit collapse all.
            </p>
          </div>
        </Card>
      </div>

      <h2>Reorder + resize</h2>
      <p class="note">
        <b>Reorder</b> — drag a rail button (or a vertical header) to move a panel in
        the strip. <code>Alt+↑</code> / <code>Alt+↓</code> does the same from the
        keyboard, always: a drag-only affordance is unreachable, not merely awkward.
        Order persists with the open/pinned state, and <code>onOrderChange</code> reports
        it. The drag itself is your own <code>@cujuju/solid-reorder-list</code> primitive
        — vendored into <code>mock/vs-accordion/vendor/</code> because it is not on npm
        yet, and to be replaced by a real dependency on promotion. Turn it off with
        <code> reorderable={'{false}'}</code>.
      </p>
      <p class="note">
        <b>Resize</b> — drag the boundary between two adjacent open panels. A drag moves
        that boundary only: it adds to one panel and takes the same from its neighbour,
        so the dock can never overflow or leave a gap. Sizes seed from the DOM on first
        drag, clamp to <code>minSize</code> (default {String(DEFAULT_MIN_SIZE_PX)}px),
        persist, and report via <code>onSizeChange</code>. <code>resetSizes()</code> on
        the API hands sizing back to the mode. Turn it off with
        <code> resizable={'{false}'}</code>.
      </p>

      <h2>Keyboard</h2>
      <p class="note">
        Activators are a roving group — the stacked headers in <code>vertical</code>, the
        rail buttons in <code>horizontal</code>, same handler for both. <b>↑/↓</b> move
        between them (wrapping), <b>Home/End</b> jump to the ends, <b>→</b> expands,
        <b> ←</b> collapses, <b>Space/Enter</b> toggles. Tab enters the panel content, so
        traversing a 6-panel dock costs one Tab, not six. Note that the nav axis is
        vertical in BOTH orientations — the activators stack downward either way, so
        ←/→ never has to mean two different things.
      </p>

      <EventLog
        log={log}
        hint="Watch the auto-collapse: opening one panel emits a close for each unpinned sibling."
      />
    </>
  );
}
