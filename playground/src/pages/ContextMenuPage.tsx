import { createSignal, type JSX } from 'solid-js';
import { ContextMenu, type ContextMenuEntry } from '@cujuju/solidjs-context-menu';
import {
  Card,
  ClipBox,
  EdgeRight,
  EventLog,
  ScrollBox,
  createEventLog,
  Code,
} from '../ui';

export function ContextMenuPage(): JSX.Element {
  const log = createEventLog();
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);
  const [gridOpacity, setGridOpacity] = createSignal(40);
  const [snap, setSnap] = createSignal(true);
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  /** Every entry kind the package supports, so a regression in any one of them is visible in the
   *  same place on every open. `when` entries are included precisely because a conditional row
   *  that stops appearing is the kind of bug nobody notices. */
  const items = (): ContextMenuEntry[] => [
    { label: 'Duplicate panel', shortcut: 'Ctrl+D', onClick: () => log.log('item', 'duplicate') },
    { label: 'Rename…', shortcut: 'F2', onClick: () => log.log('item', 'rename') },
    { label: 'Unavailable', disabled: true, disabledTooltip: 'Needs a broker connection', onClick: () => log.log('item', 'SHOULD NOT FIRE') },
    { divider: true },
    {
      label: 'Snap to grid',
      checked: snap(),
      keepOpen: true, // stays open — a checkbox you have to reopen to toggle twice is a tax
      onClick: () => { setSnap((s) => !s); log.log('checkbox', { snap: !snap() }); },
    },
    {
      label: 'Show advanced rows',
      checked: showAdvanced(),
      keepOpen: true,
      onClick: () => { setShowAdvanced((s) => !s); log.log('checkbox', { advanced: !showAdvanced() }); },
    },
    {
      label: 'Advanced: reset layout',
      when: () => showAdvanced(),
      onClick: () => log.log('item', 'reset-layout (conditional row)'),
    },
    {
      slider: true,
      label: 'Grid opacity',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      value: gridOpacity,
      onChange: (v) => { setGridOpacity(v); log.log('slider', { gridOpacity: v }); },
    },
    { divider: true },
    {
      submenu: true,
      label: 'Move to',
      children: [
        { label: 'Workspace 1', onClick: () => log.log('submenu', 'ws1') },
        { label: 'Workspace 2', onClick: () => log.log('submenu', 'ws2') },
        {
          submenu: true,
          label: 'Nested deeper',
          children: [
            { label: 'Workspace 3', onClick: () => log.log('submenu', 'ws3 (depth 2)') },
            { label: 'Workspace 4', onClick: () => log.log('submenu', 'ws4 (depth 2)') },
          ],
        },
      ],
    },
    {
      row: true,
      buttons: [
        { label: 'Top', onClick: () => log.log('button-row', 'top') },
        { label: 'Bottom', onClick: () => log.log('button-row', 'bottom') },
        { label: 'Fit', onClick: () => log.log('button-row', 'fit') },
      ],
    },
    { custom: () => <div class="readout" style={{ padding: '4px 10px' }}>custom JSX row</div> },
    { divider: true },
    { label: 'Close panel', danger: true, onClick: () => log.log('item', 'close (danger)') },
  ];

  const openAt = (e: MouseEvent, where: string): void => {
    e.preventDefault();
    setAt({ x: e.clientX, y: e.clientY });
    log.log('open', { where, x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <h1>@cujuju/solidjs-context-menu</h1>
      <p class="note">
        A cursor-positioned menu on the <code>.glass-menu</code> surface. It is not anchored to an
        element — it is anchored to the POINT you right-clicked, which is what makes its scroll
        behaviour (below) interesting.
      </p>
      <Code cap="usage">{`
import { ContextMenu, type ContextMenuEntry } from '@cujuju/solidjs-context-menu';

const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);
const items: ContextMenuEntry[] = [
  { kind: 'item', label: 'Close position', onSelect: () => … },
  { kind: 'divider' },
  { kind: 'item', label: 'Delete', danger: true, onSelect: () => … },
];

<div onContextMenu={(e) => { e.preventDefault(); setAt({ x: e.clientX, y: e.clientY }); }}>
  right-click me
</div>
<Show when={at()}>
  <ContextMenu items={items} x={at()!.x} y={at()!.y} onClose={() => setAt(null)} />
</Show>
`}</Code>

      <h2>1 · Variants</h2>
      <p class="note">
        Every entry kind in one menu: item, shortcut, disabled + tooltip, divider, checkbox
        (<code>keepOpen</code>), a conditional <code>when</code> row, slider, nested submenus two
        deep, a button row, a custom JSX row, and a danger item. Toggle "show advanced rows" and
        watch a row appear without the menu closing.
      </p>
      <div class="row">
        <Card cap="right-click — every entry kind">
          <div class="canvas" onContextMenu={(e) => openAt(e, 'variants')}>right-click</div>
        </Card>
        <Card cap="live state (the menu writes straight through)">
          <span class="readout">
            grid opacity <b>{gridOpacity()}%</b>
            <br />snap <b>{String(snap())}</b>
            <br />advanced rows <b>{String(showAdvanced())}</b>
          </span>
        </Card>
      </div>

      <h2>2 · Hostile ancestors</h2>
      <p class="note">
        The menu is a top-layer popover, so <code>overflow: hidden</code> cannot touch it, and it
        clamps against the viewport rather than running off it — right-click near the right edge
        and it opens leftward.
      </p>
      <div class="row">
        <Card cap="overflow: hidden — escapes (top layer)">
          <ClipBox width="190px">
            <div class="canvas" style={{ height: '80px' }} onContextMenu={(e) => openAt(e, 'clip')}>
              right-click
            </div>
          </ClipBox>
        </Card>
        <Card cap="⚠ overflow-y: auto — open the menu, THEN SCROLL">
          <ScrollBox width="230px" height="160px">
            <div
              class="canvas"
              style={{ height: '70px', 'min-width': '0' }}
              onContextMenu={(e) => openAt(e, 'scrollbox')}
            >
              right-click
            </div>
          </ScrollBox>
        </Card>
        <Card cap="right viewport edge — clamps leftward" wide>
          <EdgeRight>
            <div
              class="canvas"
              style={{ width: '160px', 'min-width': '0' }}
              onContextMenu={(e) => openAt(e, 'edge')}
            >
              right-click →
            </div>
          </EdgeRight>
        </Card>
      </div>
      <p class="note">
        <b>BUG — the scroll box.</b> The menu has no scroll handling of any kind. Open it over the
        scroll box and scroll: the menu stays frozen at the viewport coordinates of a click whose
        target has now moved (or left the box entirely), so it hovers over a row it was never
        about. A cursor-anchored menu has no anchor to <i>follow</i>, which means the only correct
        answer is to <b>dismiss on outside scroll</b> — precisely what{' '}
        <code>createOutsideScrollDismiss</code> in <code>@cujuju/solidjs-hooks</code> exists for,
        and what its sibling <code>chip-flyout</code> already does. This package does not call it.
      </p>

      <h2>3 · State &amp; dismiss</h2>
      <p class="note">
        <b>No controlled/uncontrolled split</b> — the caller owns everything. You store the click
        point and render <code>&lt;ContextMenu x y items onClose&gt;</code> while it should exist;
        the menu never manages its own visibility. Exit paths: <b>Escape</b>, <b>outside
        pointerdown</b>, and <b>select an item</b> (which fires <code>onClose</code> unless the
        entry sets <code>keepOpen</code> — the two checkboxes above prove that branch). There is
        no scroll-away path, per the section above. Every one of them lands in the log as{' '}
        <code>onClose</code>, and — like <code>anchored-popover</code> — the cause is not reported.
      </p>
      <div class="row">
        <Card cap="try each exit: Escape · click outside · pick an item · toggle a checkbox">
          <div class="canvas" onContextMenu={(e) => openAt(e, 'dismiss')}>right-click</div>
          <span class="readout">
            menu is <b>{at() ? 'open' : 'closed'}</b>
          </span>
        </Card>
      </div>

      <h2>4 · Event log</h2>
      <div class="row">
        <EventLog
          log={log}
          hint="A keepOpen checkbox must log its toggle and NOT log onClose. Scrolling with the menu open must log nothing — that silence is the bug."
        />
      </div>

      {at() && (
        <ContextMenu
          items={items()}
          x={at()!.x}
          y={at()!.y}
          onClose={() => {
            setAt(null);
            log.log('onClose', { cause: 'escape / outside / item (not distinguished)' });
          }}
        />
      )}
    </>
  );
}
