import { For, Show, createEffect, createSignal, type JSX } from 'solid-js';
import {
  AccordionGroup,
  AccordionLeaf,
  AccordionPanel,
  Breadcrumb,
  useAccordionGroup,
  type AccordionGroupApi,
  type AccordionRailSide,
  type AccordionLayout,
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

/** Cap for the eviction demo. Two, not three: with three the eviction only fires
 *  after four clicks, by which point it reads as a glitch rather than a rule. */
const MAX_OPEN_DEMO = 2;

/** Fake tree for the Miller-column demo. */
const FOLDERS = [
  { name: 'components', files: ['AppShell.tsx', 'Panel.tsx', 'Rail.tsx'] },
  { name: 'hooks', files: ['useDock.ts', 'useResize.ts'] },
  { name: 'utils', files: ['format.ts', 'clamp.ts', 'ids.ts', 'dates.ts'] },
];

/**
 * Symbols per file, for the CHAINED-leaf demo (file → symbol).
 *
 * Deliberately not every file: a chain that always continues never shows the user
 * where it ENDS, and "this leaf is terminal for this selection" is half of what
 * the chain is demonstrating.
 */
const SYMBOLS: Record<string, string[]> = {
  'AppShell.tsx': ['<AppShell>', 'useShellLayout', 'SHELL_MIN_WIDTH'],
  'Panel.tsx': ['<Panel>', '<PanelHeader>'],
  'useDock.ts': ['useDock', 'DockState'],
  'format.ts': ['formatPrice', 'formatQty'],
};

const symbolsFor = (file: string | null): string[] =>
  file === null ? [] : (SYMBOLS[file] ?? []);

/**
 * Panels for the rail-overflow card.
 *
 * Twelve, which is enough that the tail cannot fit any dock height this page uses
 * — the card is about the buttons that DON'T fit, so a count that merely might
 * overflow would make the demo depend on the reader's window size.
 */
const OVERFLOW_PANEL_TITLES = [
  'Watchlist', 'Positions', 'Orders', 'Chain', 'Risk', 'Alerts',
  'Fills', 'Greeks', 'News', 'Notes', 'Scanner', 'Journal',
];

/** Rail labels are rotated into a 40px strip, so they are abbreviated. */
const RAIL_LABEL_LENGTH = 4;

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

  let capApi: AccordionGroupApi | undefined;
  const [saved, setSaved] = createSignal<AccordionLayout | null>(null);
  const [dense, setDense] = createSignal(false);
  const [animated, setAnimated] = createSignal(true);

  const [autoHide, setAutoHide] = createSignal(true);
  const [hoverToOpen, setHoverToOpen] = createSignal(false);
  const [railMode, setRailMode] = createSignal<'menu' | 'pan'>('menu');

  const [folder, setFolder] = createSignal<string | null>(null);
  const [file, setFile] = createSignal<string | null>(null);
  const [symbol, setSymbol] = createSignal<string | null>(null);
  const files = (): string[] => FOLDERS.find((f) => f.name === folder())?.files ?? [];

  /**
   * A SIGNAL, not a `let`. The breadcrumb below renders from this group's API, and
   * a plain variable assigned in `apiRef` would never notify the JSX that it had
   * arrived — the bar would stay empty for the life of the page.
   */
  const [millerApi, setMillerApi] = createSignal<AccordionGroupApi>();

  /** The files column has no leaf-style controlled `open`, so the selection drives it
   *  through the group API — this is the wiring a real Miller browser owns. */
  createEffect(() => {
    millerApi()?.setOpen('mc-files', folder() !== null);
  });

  /**
   * Truncating the path closes columns, and the ones this browser owns as SIGNALS
   * have to be cleared here — `<AccordionLeaf>` is controlled, so the breadcrumb
   * deliberately cannot close a leaf behind the consumer's back. Clearing a level
   * clears everything downstream of it, which is the same cascade the chain
   * enforces structurally.
   */
  const truncateMiller = (closedIds: readonly string[]): void => {
    if (closedIds.includes('mc-symbol')) setSymbol(null);
    if (closedIds.includes('mc-detail')) {
      setFile(null);
      setSymbol(null);
    }
    if (closedIds.includes('mc-files')) {
      setFolder(null);
      setFile(null);
      setSymbol(null);
    }
  };

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

      <h2>Auto-hide — where the pin changes meaning</h2>
      <p class="note">
        <code>autoHide</code> turns the rail into a Visual Studio auto-hide dock. An
        unpinned panel no longer opens as a column that pushes its siblings around: it
        opens as a transient <b>overlay</b> anchored to its own rail button, floating
        over the content and dismissing when you look away. <b>Pinning it promotes it
        to a real docked column.</b>
      </p>
      <p class="note">
        This is the one place the pin stops meaning "exempt from auto-collapse" and
        starts meaning <b>"make this permanent"</b> — and the two readings are the same
        idea seen from different sides. In both, the pin is what survives the next
        thing you do. Toggle <code>autoHide</code> off and the identical panels go back
        to being plain columns, which is the comparison worth making with both states
        in front of you.
      </p>
      <div class="row">
        <Card cap="autoHide — unpinned opens as an overlay, pinned docks" wide>
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
              <button
                class="demo-btn"
                data-active={autoHide() ? '' : undefined}
                onClick={() => setAutoHide((v) => !v)}
              >
                autoHide: {String(autoHide())}
              </button>
              <button
                class="demo-btn"
                data-active={hoverToOpen() ? '' : undefined}
                disabled={!autoHide()}
                title={
                  autoHide()
                    ? undefined
                    : 'hoverToOpen only means anything while autoHide is on'
                }
                onClick={() => setHoverToOpen((v) => !v)}
              >
                hoverToOpen: {String(hoverToOpen())}
              </button>
            </div>
            <AccordionGroup
              orientation="horizontal"
              mode="fill"
              policy="multi"
              autoHide={autoHide()}
              hoverToOpen={hoverToOpen()}
              height="320px"
              ariaLabel="Auto-hide dock"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `hide:${id}`)}
              onPinChange={(id, p) => log.log(p ? 'pin' : 'unpin', `hide:${id}`)}
            >
              <AccordionPanel id="ah-explorer" title="Solution Explorer" railLabel="EXPL" icon="📁" count={7}>
                <Rows n={10} label="file" />
              </AccordionPanel>
              <AccordionPanel id="ah-props" title="Properties" railLabel="PROP" icon="⚙" count={12}>
                <Rows n={12} label="prop" />
              </AccordionPanel>
              <AccordionPanel id="ah-toolbox" title="Toolbox" railLabel="TOOL" icon="🧰">
                <Rows n={8} label="tool" />
              </AccordionPanel>
              <AccordionPanel id="ah-output" title="Output" railLabel="OUT" icon="📃">
                <Rows n={14} label="line" />
              </AccordionPanel>
            </AccordionGroup>
            <p class="note">
              Click a rail button — the panel floats in over the content. Click elsewhere
              and it goes away without you having to close it. Now <b>pin</b> it: it stops
              floating and becomes a column that takes real space, and the next panel you
              open floats over the remainder instead of displacing it. Unpin to send it
              back to being transient. With <code>hoverToOpen</code> on, the flyout also
              opens on hover — off by default, because a rail you cannot move the mouse
              across without summoning panels is hostile.
            </p>
          </div>
        </Card>
      </div>

      <h2>Rail overflow — a menu, or a pannable strip</h2>
      <p class="note">
        Twelve panels do not fit in a 40px rail, and a scrollbar in a strip that narrow
        lands on top of the rotated labels. Two strategies, one prop. Under
        <code> railOverflow="menu"</code> the buttons that do not fit collapse into a
        <code> ⋯</code> at the end of the rail; under <code>railOverflow="pan"</code> the
        rail keeps scrolling but the scrollbar is replaced by a drag gesture and a fade
        at each end.
      </p>
      <p class="note">
        They are alternatives rather than companions, which is why it is one prop and
        not two booleans: once the menu has absorbed everything that did not fit, the
        rail no longer overflows, so there is nothing left to pan.
      </p>
      <div class="row">
        <Card cap="12 panels in a short rail — switch the strategy" wide>
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px' }}>
              <button
                class="demo-btn"
                data-active={railMode() === 'menu' ? '' : undefined}
                onClick={() => setRailMode('menu')}
              >
                railOverflow: menu
              </button>
              <button
                class="demo-btn"
                data-active={railMode() === 'pan' ? '' : undefined}
                onClick={() => setRailMode('pan')}
              >
                railOverflow: pan
              </button>
            </div>
            <AccordionGroup
              orientation="horizontal"
              mode="natural"
              policy="multi"
              railOverflow={railMode()}
              height="300px"
              ariaLabel="Rail overflow demo"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `of:${id}`)}
            >
              <For each={OVERFLOW_PANEL_TITLES}>
                {(title, i) => (
                  <AccordionPanel
                    id={`of-${i()}`}
                    title={title}
                    railLabel={title.slice(0, RAIL_LABEL_LENGTH).toUpperCase()}
                    defaultOpen={i() === 0}
                  >
                    <Rows n={6} label="row" />
                  </AccordionPanel>
                )}
              </For>
            </AccordionGroup>
            <p class="note">
              <b>menu</b> — the tail collapses into <code>⋯</code>; open it and the panels
              that did not fit are listed, with a checkmark on the ones already open. The
              rail re-measures itself when the window, the density or the font changes, so
              the cut never goes stale.
            </p>
            <p class="note">
              <b>pan</b> — drag the rail to scroll it. <b>Middle-button drag</b> anywhere,
              <b> Space held + drag</b> anywhere, or a <b>plain drag on empty rail
              background</b> all pan. A plain drag <i>on a button</i> still <b>reorders</b>,
              which is the whole reason pan needs a modifier: reorder is available always,
              panning only once the rail overflows, so the always-available gesture keeps
              the unmodified drag. A pan that actually moved swallows the click, so
              panning across a button never opens it.
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
      <p class="note">
        A leaf is terminal, but terminal is not the same as LAST: give one a
        <code> parentId</code> and it becomes a link in a <b>chain</b> — file → symbol —
        while keeping everything that makes it a leaf. The dependency runs one way, so a
        child is open only when its parent is: close the file and the symbol pane goes
        with it, because a "references" column describing a file that is no longer open
        is the UI asserting something false.
      </p>
      <div class="row">
        <Card cap="click a folder → a file → a symbol → the chained leaves" wide>
          <div style={{ width: '100%' }}>
            {/* Above the group, not inside it: in `horizontal` orientation anything
                inside the group IS a column, so the bar would become one. This is why
                <Breadcrumb> takes a `group` prop as well as reading context.

                The <Show> is load-bearing, not defensive. `apiRef` fires while the
                group renders, which is AFTER this sibling is created — so on the first
                pass the signal is still undefined, and <Breadcrumb> treats a group it
                can reach neither by prop nor by context as a usage error and throws.
                Gating on the signal defers the breadcrumb's creation to the pass where
                the API exists. */}
            <Show when={millerApi()}>
              {(api) => <Breadcrumb group={api()} onTruncate={truncateMiller} />}
            </Show>
            <AccordionGroup
              orientation="horizontal"
              mode="natural"
              policy="multi"
              height="330px"
              reorderable={false}
              apiRef={setMillerApi}
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
                <PickList
                  items={files()}
                  selected={file()}
                  onPick={(name) => {
                    setFile(name);
                    setSymbol(null);
                  }}
                />
              </AccordionPanel>

              <AccordionLeaf
                id="mc-detail"
                open={file() !== null}
                title={file() ?? ''}
                icon="📄"
                accent="#10b981"
                defaultSize={260}
                onClose={() => {
                  setFile(null);
                  setSymbol(null);
                }}
              >
                <div class="readout" style={{ padding: '6px 8px', 'line-height': '1.7' }}>
                  <div><b>{file()}</b></div>
                  <div>path — src/{folder()}/{file()}</div>
                  <div>size — 4.2 kB</div>
                </div>
                <PickList items={symbolsFor(file())} selected={symbol()} onPick={setSymbol} />
              </AccordionLeaf>

              {/* The CHAINED leaf. `parentId` is what makes it a waypoint rather than a
                  second terminal pane: it orders the columns and it makes the cascade
                  structural, so this can never outlive the file it describes. */}
              <AccordionLeaf
                id="mc-symbol"
                parentId="mc-detail"
                open={symbol() !== null}
                title={symbol() ?? ''}
                icon="🔗"
                accent="#a78bfa"
                defaultSize={220}
                onClose={() => setSymbol(null)}
              >
                <div class="readout" style={{ padding: '6px 8px', 'line-height': '1.7' }}>
                  <div><b>{symbol()}</b></div>
                  <div>declared in — {file()}</div>
                  <div>references — 3</div>
                  <div>this pane is a CHAINED leaf: parentId="mc-detail"</div>
                </div>
              </AccordionLeaf>
            </AccordionGroup>
            <p class="note">
              Selecting a folder opens the files column; a file opens the detail leaf; a
              symbol inside it opens a second leaf beside the first. Close the detail leaf
              and the symbol leaf goes with it — you never have to close the chain by
              hand. (Only some files carry symbols, so the chain also visibly ENDS.)
            </p>
            <p class="note">
              <b>Breadcrumb</b> — the bar above is the same open sequence read as a path.
              Click a crumb to <b>truncate</b> the chain: every column after it closes.
              The current location is plain text, not a button, because there is nothing
              after it to truncate. A long path collapses its middle into a
              <code> ⋯</code> you can click to expand rather than wrapping or scrolling,
              since a bar that wraps changes the height of the chrome around it.
            </p>
          </div>
        </Card>
      </div>

      <p class="note">
        The breadcrumb's rendering is yours: <code>renderCrumb</code> supplies each
        crumb's content and <code>separator</code> replaces the divider. The wrapper —
        the tab stop, <code>aria-current</code>, the click-to-truncate, the arrow-key
        handler — stays with the component, so a custom look cannot cost the keyboard
        story. Both bars below are bound to the SAME group as the browser above, so they
        track it live.
      </p>
      <div class="row">
        <Card cap="renderCrumb + separator — same path, different clothes" wide>
          <div style={{ width: '100%' }}>
            {/* Same deferral as the bar above — see the note there. */}
            <Show when={millerApi()}>
              {(api) => (
                <Breadcrumb
                  group={api()}
                  onTruncate={truncateMiller}
                  ariaLabel="Breadcrumb with custom crumbs"
                  /* Inline expressions, not stored nodes: Solid wraps a prop expression
                     in a getter, so each separator slot gets its own node. A variable
                     holding one node would be moved to the last slot and appear once. */
                  separator={<span style={{ opacity: 0.4 }}>/</span>}
                  renderCrumb={(crumb) => (
                    <span style={{ display: 'inline-flex', gap: '4px', 'align-items': 'center' }}>
                      <span aria-hidden="true">{crumb.isLeaf ? '📄' : '📁'}</span>
                      <span>{crumb.label}</span>
                    </span>
                  )}
                />
              )}
            </Show>
            <p class="note">
              Pick a folder and a file above, then compare this bar with the default one.
              Same path, same truncation, same keyboard behaviour — only the content of
              each crumb and the divider differ. With nothing open both bars render
              nothing at all rather than an empty strip.
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

      <h2>Layout snapshots, maxOpen, density, animation</h2>
      <p class="note">
        One dock, four features that are otherwise invisible. <b>Save</b> captures
        <code> getLayout()</code> — open set, pins, order and sizes as one plain object —
        and <b>restore</b> plays it back; a version mismatch is refused whole rather than
        half-applied. <code>maxOpen={'{2}'}</code> caps the open columns: open a third and
        the least-recently-opened UNPINNED one is evicted, so pinning is how you keep a
        column through the churn. The toggles switch <code>density</code> and
        <code> animated</code>, both of which are pure CSS.
      </p>
      <div class="row">
        <Card cap="maxOpen=2 — pin one, then open others and watch eviction" wide>
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
              <button class="demo-btn" onClick={() => setSaved(capApi?.getLayout() ?? null)}>
                save layout
              </button>
              <button
                class="demo-btn"
                disabled={saved() === null}
                onClick={() => {
                  const l = saved();
                  if (l !== null) capApi?.setLayout(l);
                }}
              >
                restore layout
              </button>
              <button
                class="demo-btn"
                data-active={dense() ? '' : undefined}
                onClick={() => setDense((v) => !v)}
              >
                density: {dense() ? 'compact' : 'comfortable'}
              </button>
              <button
                class="demo-btn"
                data-active={animated() ? '' : undefined}
                onClick={() => setAnimated((v) => !v)}
              >
                animated: {String(animated())}
              </button>
              <span class="readout">
                saved <b>{saved() === null ? 'none' : `${saved()?.open.length} open`}</b>
              </span>
            </div>
            <AccordionGroup
              apiRef={(a) => (capApi = a)}
              orientation="horizontal"
              mode="fill"
              policy="multi"
              maxOpen={MAX_OPEN_DEMO}
              density={dense() ? 'compact' : 'comfortable'}
              animated={animated()}
              height="320px"
              ariaLabel="Cap and layout demo"
              onChange={(id, open) => log.log(open ? 'open' : 'close', `cap:${id}`)}
              onPinChange={(id, p) => log.log(p ? 'pin' : 'unpin', `cap:${id}`)}
            >
              <AccordionPanel id="k-a" title="Watchlist" badge="info" count={5} defaultOpen>
                <Rows n={8} label="sym" />
              </AccordionPanel>
              <AccordionPanel id="k-b" title="Positions" badge="success" count={2}>
                <Rows n={8} label="pos" />
              </AccordionPanel>
              <AccordionPanel id="k-c" title="Orders" badge="warning">
                <Rows n={8} label="ord" />
              </AccordionPanel>
              <AccordionPanel id="k-d" title="Errors" badge="danger" count={3}>
                <Rows n={8} label="err" />
              </AccordionPanel>
            </AccordionGroup>
            <p class="note">
              The coloured dots are <code>badge</code> — a state dot, not a count. A panel
              can carry an urgent badge and a count of zero, which is why they are separate
              slots. Right-click any rail button or title bar for the context menu.
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
      <p class="note">
        <b>Collapse by overdrag</b> — keep pulling a splitter past a panel's minimum
        instead of stopping at it. Once you overshoot the minimum by the collapse
        margin the panel arms itself, and releasing there collapses it to the rail
        rather than snapping it back. Try it on any horizontal card above: drag the
        boundary of an open column hard into its neighbour and let go.
      </p>
      <p class="note">
        This exists because the alternative is a dead zone. A splitter that simply
        stops at <code>minSize</code> spends the rest of the drag ignoring the pointer,
        which reads as the control having hung; carrying on past the floor turns that
        wasted travel into the one gesture you actually wanted. The panel arms
        <i> before</i> release, so overshooting and changing your mind is a drag back,
        not an undo — nothing collapses until you let go.
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
