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
} from '../ui';

const PLACEMENTS: AnchoredPlacement[] = [
  'below-start', 'below-end', 'above-start', 'above-end',
  'right-start', 'right-end', 'left-start', 'left-end',
];

/**
 * One trigger + its popover.
 *
 * `AnchoredPopover` is ALWAYS controlled — `open` is an `Accessor<boolean>` the consumer owns
 * and `onDismiss` is a request, not a state change. Every instance here holds its own signal;
 * there is no uncontrolled mode to demonstrate because the package does not have one.
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
          // onDismiss fires for BOTH Escape and outside-pointerdown, and the primitive does not
          // say which. A real gap for anything that wants to treat them differently (restore
          // focus on Escape, but not on a click that already moved focus somewhere else).
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
