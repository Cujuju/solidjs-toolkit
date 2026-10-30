import { For, createSignal, type JSX } from 'solid-js';
import AnchoredPopover, { type AnchoredPlacement } from '@cujuju/solidjs-anchored-popover';
import {
  Card,
  ClipBox,
  EdgeRight,
  EventLog,
  ScrollBox,
  createEventLog,
  type EventLogApi,
  Code,
} from '../ui';

const PLACEMENTS: AnchoredPlacement[] = [
  'below-start', 'below-end', 'above-start', 'above-end',
  'right-start', 'right-end', 'left-start', 'left-end',
];

/**
 * One trigger + its popover. `AnchoredPopover` is ALWAYS controlled — `open` is an accessor the
 * consumer owns and `onDismiss` is a request. There is no uncontrolled mode.
 */
function Pop(props: {
  log: EventLogApi;
  placement?: AnchoredPlacement;
  label?: string;
  offsetPx?: number;
  centered?: boolean;
  tag?: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();
  const tag = (): string => props.tag ?? props.placement ?? 'below-start';

  return (
    <>
      <button
        ref={setAnchor}
        class="demo-btn"
        onClick={() => {
          const next = !open();
          setOpen(next);
          props.log.log(next ? 'open' : 'close', { via: 'trigger', who: tag() });
        }}
      >
        {props.label ?? props.placement}
      </button>
      <AnchoredPopover
        open={open}
        anchor={anchor}
        onDismiss={() => {
          setOpen(false);
          // onDismiss fires for BOTH Escape and outside-pointerdown without saying which — a real
          // gap for anything wanting to treat them differently.
          props.log.log('onDismiss', { who: tag(), cause: 'escape-or-outside (not distinguished)' });
        }}
        placement={props.placement}
        offsetPx={props.offsetPx}
        centered={props.centered}
        class="glass-menu"
        role="dialog"
        aria-label={tag()}
      >
        <div style={{ padding: '10px 12px', font: '11px/1.6 var(--mono)', 'min-width': '150px' }}>
          <div>{tag()}</div>
          <div style={{ opacity: 0.7 }}>Esc / outside click dismisses</div>
        </div>
      </AnchoredPopover>
    </>
  );
}

/** Wider than the 8px default, so the clamp is visible against the viewport edge. */
const WIDE_VIEWPORT_MARGIN_PX = 24;
const BACKDROP_TINT = 'rgba(0, 0, 0, 0.35)';

/**
 * A menu with a submenu: the child takes its x from the parent panel (`horizontalAnchor`), its y
 * from the row, and re-promotes the parent (`parentPopoverRef`) so stacking stays parent-below-child.
 */
function Nested(props: { log: EventLogApi }) {
  const [open, setOpen] = createSignal(false);
  const [subOpen, setSubOpen] = createSignal(false);
  const [dim, setDim] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();
  const [row, setRow] = createSignal<HTMLButtonElement>();
  const [panel, setPanel] = createSignal<HTMLDivElement>();
  const shell = (): HTMLElement | null => panel()?.closest<HTMLElement>('[popover]') ?? null;
  let first: HTMLButtonElement | undefined;
  const close = (): void => { setSubOpen(false); setOpen(false); };
  return (
    <>
      <button ref={setAnchor} class="demo-btn" aria-controls="ap-nested-panel" onClick={() => setOpen((o) => !o)}>
        menu with submenu
      </button>
      <label><input type="checkbox" checked={dim()} onChange={(e) => setDim(e.currentTarget.checked)} /> dim backdrop</label>
      <AnchoredPopover
        open={open}
        anchor={anchor}
        onDismiss={() => { close(); props.log.log('onDismiss', { who: 'nested-parent' }); }}
        id="ap-nested-panel"
        class="glass-menu"
        role="menu"
        aria-label="Nested demo"
        viewportMarginPx={WIDE_VIEWPORT_MARGIN_PX}
        contentRef={setPanel}
        onShown={() => { first?.focus(); props.log.log('onShown', 'parent: first row focused'); }}
        shellClass="demo-backdrop-shell"
        shellStyle={() => ({ '--demo-backdrop': dim() ? BACKDROP_TINT : 'transparent' })}
        shouldSuppressDismiss={(t) => !!t.closest('[popover]:popover-open')}
      >
        <div style={{ display: 'grid', padding: '6px', 'min-width': '170px' }}>
          <button ref={first} class="demo-btn" onClick={close}>Plain item</button>
          <button ref={setRow} class="demo-btn" onClick={() => setSubOpen((o) => !o)}>Submenu ▸</button>
        </div>
      </AnchoredPopover>
      <AnchoredPopover
        open={subOpen}
        anchor={row}
        horizontalAnchor={panel}
        parentPopoverRef={shell}
        onDismiss={() => setSubOpen(false)}
        placement="right-start"
        class="glass-menu"
        role="menu"
        aria-label="Submenu"
      >
        <div style={{ display: 'grid', padding: '6px', 'min-width': '140px' }}>
          <button class="demo-btn" onClick={close}>Child A</button>
          <button class="demo-btn" onClick={close}>Child B</button>
        </div>
      </AnchoredPopover>
    </>
  );
}

export function AnchoredPopoverPage(): JSX.Element {
  const log = createEventLog();
  const [progOpen, setProgOpen] = createSignal(false);
  const [progAnchor, setProgAnchor] = createSignal<HTMLSpanElement>();

  return (
    <>
      <h1>@cujuju/solidjs-anchored-popover</h1>
      <p class="note">
        The HTML Popover API in <b>manual</b> mode, with a custom outside-click dismiss that
        excludes the anchor — so clicking the trigger toggles cleanly instead of racing the UA's
        light-dismiss handler. It is the positioning primitive underneath{' '}
        <code>select-flyout</code> and <code>editable-list-flyout</code>, so everything found on
        this page is inherited by both.
      </p>
      <Code cap="usage">{`
import AnchoredPopover from '@cujuju/solidjs-anchored-popover';

const [open, setOpen] = createSignal(false);
const [anchor, setAnchor] = createSignal<HTMLElement | null>(null);

<button ref={setAnchor} onClick={() => setOpen((o) => !o)}>open</button>
<AnchoredPopover
  open={open}                       // accessor, not a boolean
  anchor={anchor}                   // accessor of the element to hang off
  onDismiss={() => setOpen(false)}  // Escape OR outside-pointerdown
  placement="below-start"           // above/below/left/right + -start/-end
  offsetPx={4}
>
  <div class="my-panel">…</div>
</AnchoredPopover>
`}</Code>

      <h2>1 · Variants</h2>
      <p class="note">
        Eight placements, each clamped into the viewport <i>after</i> placement. Note that
        clamping is not flipping: an <code>above-*</code> popover with no room above is shoved
        DOWN over its own anchor rather than opening below it.
      </p>
      <div class="row">
        <Card cap="the eight placements">
          <For each={PLACEMENTS}>{(p) => <Pop log={log} placement={p} />}</For>
        </Card>
        <Card cap="offsetPx — negative under-tucks (the submenu pattern)">
          <Pop log={log} placement="right-start" offsetPx={-3} label="offset −3" tag="offset:-3" />
          <Pop log={log} placement="below-start" offsetPx={24} label="offset 24" tag="offset:24" />
        </Card>
        <Card cap="centered — horizontal anchoring dropped, vertical kept">
          <Pop log={log} placement="below-start" centered label="centered" tag="centered" />
        </Card>
      </div>

      <h2>Nested surfaces and hooks</h2>
      <Code cap="more props">{`
<AnchoredPopover open={open} anchor={trigger} onDismiss={close}
  id="menu-panel"                                  // pair with aria-controls on the trigger
  viewportMarginPx={24}                            // edge clamp; default 8
  contentRef={setPanel}                            // the content element
  onShown={() => firstItem.focus()}                // shown AND positioned
  shellClass="my-shell" shellStyle={() => ({ '--backdrop': tint() })}  // ::backdrop styling
  shouldSuppressDismiss={(t) => !!t.closest('[popover]:popover-open')}>  // child clicks keep it
  …
</AnchoredPopover>
<AnchoredPopover open={subOpen} anchor={row} placement="right-start"
  horizontalAnchor={panel}                         // x from the parent panel, y from the row
  parentPopoverRef={parentShell}                   // keep the parent painted below the child
  onDismiss={() => setSubOpen(false)}>…</AnchoredPopover>
`}</Code>
      <div class="row">
        <Card cap="submenu: horizontalAnchor · parentPopoverRef · shouldSuppressDismiss · onShown · contentRef · id · viewportMarginPx · shellClass/shellStyle">
          <Nested log={log} />
        </Card>
      </div>

      <h2>2 · Hostile ancestors</h2>
      <p class="note">
        <b>Clipping is a non-issue here</b>, and that is worth seeing: the popover lives in the
        browser's TOP LAYER, so no ancestor's <code>overflow</code> can reach it. The scroll box
        is the opposite story.
      </p>
      <div class="row">
        <Card cap="overflow: hidden — escapes (top layer)">
          <ClipBox>
            <Pop log={log} placement="below-start" label="open" tag="in-clip" />
          </ClipBox>
        </Card>
        <Card cap="⚠ overflow-y: auto — open it, THEN SCROLL. It does not follow.">
          <ScrollBox height="160px">
            <div style={{ padding: '10px' }}>
              <Pop log={log} placement="below-start" label="open, then scroll" tag="in-scrollbox" />
            </div>
          </ScrollBox>
        </Card>
        <Card cap="right viewport edge — clamps, does not run off-screen" wide>
          <EdgeRight>
            <Pop log={log} placement="below-start" label="at the edge →" tag="at-edge" />
          </EdgeRight>
        </Card>
      </div>
      <p class="note">
        <b>BUG — the scroll box.</b> <code>AnchoredPopover</code> registers a{' '}
        <code>resize</code> listener and <b>nothing else</b>: no scroll listener at all, capturing
        or otherwise. Open the popover in the middle box and scroll. The panel stays pinned to
        viewport coordinates while its anchor slides away underneath, so it ends up floating over
        unrelated content still claiming to belong to a button that is no longer there. It neither{' '}
        <i>follows</i> the anchor (what the pill pop-outs do, with a CAPTURING <code>scroll</code>{' '}
        listener — scroll does not bubble from an element, so a plain listener on{' '}
        <code>window</code> never hears an inner box move) nor <i>dismisses</i> (what{' '}
        <code>chip-flyout</code> does, with <code>createOutsideScrollDismiss</code> — a hook that
        already exists in <code>@cujuju/solidjs-hooks</code> and that this package does not use).
      </p>

      <h2>3 · State &amp; dismiss</h2>
      <p class="note">
        <b>No uncontrolled mode</b> — <code>open</code> is an accessor the caller owns. Three exit
        paths exist: <b>Escape</b>, <b>outside pointerdown</b>, and <b>programmatic</b>. There is
        no select-an-item path (this is a primitive, not a menu) and, per the section above, no
        scroll-away path. Watch the log: Escape and outside-click are <i>indistinguishable</i> at
        the API — both arrive as a bare <code>onDismiss()</code>.
      </p>
      <div class="row">
        <Card cap="driven entirely from outside — no trigger at all">
          <span ref={setProgAnchor} class="strike" style={{ 'margin-left': '0' }}>
            anchor
          </span>
          <button
            class="demo-btn"
            onClick={() => {
              setProgOpen(true);
              log.log('open', { via: 'programmatic' });
            }}
          >
            open
          </button>
          <button
            class="demo-btn"
            onClick={() => {
              setProgOpen(false);
              log.log('close', { via: 'programmatic' });
            }}
          >
            close
          </button>
          <span class="readout">open <b>{String(progOpen())}</b></span>
          <AnchoredPopover
            open={progOpen}
            anchor={progAnchor}
            onDismiss={() => {
              setProgOpen(false);
              log.log('onDismiss', { who: 'programmatic', cause: 'escape-or-outside' });
            }}
            class="glass-menu"
            role="dialog"
            aria-label="Programmatic"
          >
            <div style={{ padding: '10px 12px', font: '11px/1.6 var(--mono)' }}>
              closed by Escape, an outside click, or the button
            </div>
          </AnchoredPopover>
        </Card>
      </div>

      <h2>4 · Event log</h2>
      <div class="row">
        <EventLog
          log={log}
          hint="Scroll the middle box with a popover open: NOTHING is logged. That silence is the bug."
        />
      </div>
    </>
  );
}
