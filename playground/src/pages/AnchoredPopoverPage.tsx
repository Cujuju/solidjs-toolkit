import { For, createSignal, type JSX } from 'solid-js';
import AnchoredPopover, { type AnchoredPlacement } from '@cujuju/solidjs-anchored-popover';
import { Card, ClipBox, ScrollBox } from '../ui';

const PLACEMENTS: AnchoredPlacement[] = [
  'below-start', 'below-end', 'above-start', 'above-end',
  'right-start', 'right-end', 'left-start', 'left-end',
];

/** One trigger + its popover, self-contained so several can be live at once. */
function Demo(props: { placement: AnchoredPlacement; label?: string }) {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();
  return (
    <>
      <button ref={setAnchor} class="demo-btn" onClick={() => setOpen((o) => !o)}>
        {props.label ?? props.placement}
      </button>
      <AnchoredPopover
        open={open}
        anchor={anchor}
        onDismiss={() => setOpen(false)}
        placement={props.placement}
        class="glass-menu"
        role="dialog"
        aria-label={props.placement}
      >
        <div style={{ padding: '10px 12px', font: '11px/1.5 var(--mono)' }}>
          <div>placement: {props.placement}</div>
          <div style={{ color: 'var(--text-muted)' }}>Esc or click outside to dismiss</div>
        </div>
      </AnchoredPopover>
    </>
  );
}

export function AnchoredPopoverPage(): JSX.Element {
  return (
    <>
      <h1>@cujuju/solidjs-anchored-popover</h1>
      <p class="note">
        HTML Popover API in <b>manual</b> mode with a custom outside-click dismiss that excludes
        the anchor, so clicking the trigger toggles cleanly without racing the UA's light-dismiss
        handler. Top-layer, so it escapes clipping ancestors by construction.
      </p>

      <h2>Eight placements</h2>
      <div class="row">
        <Card cap="each clamps into the viewport after placement">
          <For each={PLACEMENTS}>{(p) => <Demo placement={p} />}</For>
        </Card>
      </div>

      <h2>
        Hostile ancestors <small>— top layer means overflow cannot touch it</small>
      </h2>
      <p class="note">
        Note what this primitive does <b>not</b> do: it repositions on <code>resize</code> only.
        There is no scroll listener, so a popover open inside the scroll box below will
        <b> detach from its anchor</b> when you scroll. That is fine for a click-dismissed menu
        (a scroll usually means you are done with it) and it is exactly why the pill pickers'
        pop-outs do not use this primitive — they must track their anchor while a dense list
        scrolls under them.
      </p>
      <div class="row">
        <Card cap="overflow: hidden">
          <ClipBox>
            <Demo placement="below-start" label="open" />
          </ClipBox>
        </Card>
        <Card cap="overflow-y: auto — open it, then scroll (it will NOT follow)">
          <ScrollBox>
            <div style={{ padding: '10px' }}>
              <Demo placement="below-start" label="open" />
            </div>
          </ScrollBox>
        </Card>
      </div>
    </>
  );
}
