import { createSignal, type JSX } from 'solid-js';
import { ContextMenu, type ContextMenuEntry } from '@cujuju/solidjs-context-menu';
import { Card, ClipBox } from '../ui';

export function ContextMenuPage(): JSX.Element {
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);
  const [gridOpacity, setGridOpacity] = createSignal(40);
  const [snap, setSnap] = createSignal(true);
  const [last, setLast] = createSignal('—');

  const items = (): ContextMenuEntry[] => [
    { label: 'Duplicate panel', onClick: () => setLast('duplicate') },
    { label: 'Rename…', onClick: () => setLast('rename'), shortcut: 'F2' },
    { divider: true },
    {
      label: 'Snap to grid',
      checked: snap(),
      keepOpen: true,
      onClick: () => { setSnap((s) => !s); setLast(`snap ${!snap()}`); },
    },
    {
      slider: true,
      label: 'Grid opacity',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      value: gridOpacity,
      onChange: setGridOpacity,
    },
    { divider: true },
    {
      submenu: true,
      label: 'Move to',
      children: [
        { label: 'Workspace 1', onClick: () => setLast('ws1') },
        { label: 'Workspace 2', onClick: () => setLast('ws2') },
        {
          submenu: true,
          label: 'More',
          children: [{ label: 'Workspace 3', onClick: () => setLast('ws3') }],
        },
      ],
    },
    {
      row: true,
      buttons: [
        { label: 'Top', onClick: () => setLast('top') },
        { label: 'Bottom', onClick: () => setLast('bottom') },
      ],
    },
    { divider: true },
    { label: 'Close panel', danger: true, onClick: () => setLast('close') },
  ];

  const openAt = (e: MouseEvent): void => {
    e.preventDefault();
    setAt({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <h1>@cujuju/solidjs-context-menu</h1>
      <p class="note">
        Cursor-positioned menu on the <code>.glass-menu</code> surface. Nested submenus, slider
        rows, button rows, checkboxes, viewport clamping, top-layer popover. Right-click either
        surface below.
      </p>

      <h2>Right-click me</h2>
      <div class="row">
        <Card cap="every entry kind">
          <div class="canvas" onContextMenu={openAt}>right-click</div>
        </Card>
        <Card cap="inside overflow: hidden — top-layer, so it escapes">
          <ClipBox width="180px">
            <div class="canvas" style={{ height: '80px' }} onContextMenu={openAt}>
              right-click
            </div>
          </ClipBox>
        </Card>
        <Card cap="state">
          <span class="readout">
            last action <b>{last()}</b>
            <br />grid opacity <b>{gridOpacity()}%</b>
            <br />snap <b>{String(snap())}</b>
          </span>
        </Card>
      </div>

      {at() && (
        <ContextMenu items={items()} x={at()!.x} y={at()!.y} onClose={() => setAt(null)} />
      )}
    </>
  );
}
