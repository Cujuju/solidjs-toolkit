import { createSignal, type JSX } from 'solid-js';
import { useHoldAction, HoldIndicator } from '@cujuju/solidjs-hold-action';
import { Card } from '../ui';

/** How long the user must hold before the destructive action fires. Long enough that it cannot
 *  be an accident, short enough that it does not feel punitive. */
const HOLD_MS = 900;

function HoldButton(props: { label: string; shape: 'circle' | 'rect' | 'bar'; onDone: () => void }) {
  const hold = useHoldAction({
    durationMs: HOLD_MS,
    onComplete: props.onDone,
    suppressClickAfterComplete: true,
  });
  return (
    <button
      class="demo-btn"
      style={{ position: 'relative', overflow: 'hidden', 'min-width': '110px' }}
      {...hold.handlers}
    >
      {props.label}
      <HoldIndicator
        progress={hold.progress}
        shape={props.shape}
        fillParent
        stroke="var(--red)"
        strokeWidth={2}
      />
    </button>
  );
}

export function HoldActionPage(): JSX.Element {
  const [fired, setFired] = createSignal(0);
  const hover = useHoldAction({
    durationMs: HOLD_MS,
    trigger: 'hover',
    onComplete: () => setFired((n) => n + 1),
  });

  return (
    <>
      <h1>@cujuju/solidjs-hold-action</h1>
      <p class="note">
        Press-and-hold confirmation — the alternative to a modal "are you sure?" for a
        destructive action. <code>useHoldAction</code> is the state machine (progress, stages,
        cancel-on-leave, click suppression after completion); <code>HoldIndicator</code> is one
        way to draw it. Hold a button for {HOLD_MS}ms.
      </p>

      <h2>Shapes</h2>
      <div class="row">
        <Card cap="press and hold — rect / bar / circle">
          <HoldButton label="Close all" shape="rect" onDone={() => setFired((n) => n + 1)} />
          <HoldButton label="Flatten" shape="bar" onDone={() => setFired((n) => n + 1)} />
          <HoldButton label="Cancel" shape="circle" onDone={() => setFired((n) => n + 1)} />
          <span class="readout">fired <b>{fired()}</b> times</span>
        </Card>
      </div>

      <h2>
        Hover trigger <small>(no click at all — dwell on it)</small>
      </h2>
      <div class="row">
        <Card cap="trigger: 'hover'">
          <div
            class="canvas"
            style={{ position: 'relative', width: '200px', height: '80px' }}
            onPointerEnter={hover.handlers.onPointerEnter}
            onPointerLeave={hover.handlers.onPointerLeave}
          >
            dwell here
            <HoldIndicator progress={hover.progress} shape="bar" fillParent stroke="var(--accent)" />
          </div>
          <span class="readout">
            progress <b>{Math.round(hover.progress() * 100)}%</b>
          </span>
        </Card>
      </div>
    </>
  );
}
