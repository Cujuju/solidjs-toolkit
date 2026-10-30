import { createSignal, For, type JSX } from 'solid-js';
import { useHoldAction, HoldIndicator } from '@cujuju/solidjs-hold-action';
import { Code, Card } from '../ui';

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

/** Box for the static geometry demos: big enough to read a stroke's placement against its border. */
const DEMO_BOX_PX = 64;
const PLACEMENTS = ['outside', 'center', 'on-border', 'inside'] as const;
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** A bordered box the indicator measures against; centres a sized (in-flow) indicator. `progress` comes from the scrubber. */
function GeometryBox(props: { cap: string; children: JSX.Element }) {
  return (
    <div style={{ display: 'grid', gap: '4px', 'justify-items': 'center', 'font-size': '11px' }}>
      <div style={{ position: 'relative', display: 'grid', 'place-items': 'center', width: `${DEMO_BOX_PX}px`, height: `${DEMO_BOX_PX}px`, border: '2px solid var(--line, #555)', 'border-radius': '10px' }}>
        {props.children}
      </div>
      {props.cap}
    </div>
  );
}

export function HoldActionPage(): JSX.Element {
  const [fired, setFired] = createSignal(0);
  const [scrub, setScrub] = createSignal(0.6);
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
      <Code cap="usage">{`
import { useHoldAction, HoldIndicator } from '@cujuju/solidjs-hold-action';

const hold = useHoldAction({
  durationMs: 900,                     // long enough not to be an accident
  onComplete: () => deleteForever(),
  suppressClickAfterComplete: true,    // the release must not also "click"
});

<button {...hold.handlers}>
  Hold to delete
  <HoldIndicator progress={hold.progress} />
</button>
`}</Code>

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

      <h2>Stroke geometry</h2>
      <p class="note">
        <code>progress</code> takes a number or an accessor, so the scrubber drives these directly. The rect follows
        its parent's corner with <code>radius</code>; the circle's start and direction are props.
      </p>
      <Code cap="geometry props">{`
<HoldIndicator progress={p} shape="rect" radius={10} strokePlacement="inside" strokeInset={2}
  strokeLinecap="round" easing={(t) => 1 - (1 - t) ** 3} />
<HoldIndicator progress={p} shape="circle" size={48} startAngle={90} direction="counterclockwise" />
`}</Code>
      <div class="row">
        <Card cap="scrub progress">
          <input type="range" min={0} max={1} step={0.01} value={scrub()} onInput={(e) => setScrub(e.currentTarget.valueAsNumber)} />
          <span class="readout">progress <b>{Math.round(scrub() * 100)}%</b></span>
        </Card>
        <Card cap="strokePlacement (rect, radius 10, strokeWidth 3)" wide>
          <For each={PLACEMENTS}>
            {(placement) => (
              <GeometryBox cap={placement}>
                <HoldIndicator progress={scrub} shape="rect" radius={10} strokeWidth={3} stroke="var(--red)" strokePlacement={placement} />
              </GeometryBox>
            )}
          </For>
          <GeometryBox cap="inside, strokeInset 6">
            <HoldIndicator progress={scrub} shape="rect" radius={10} strokeWidth={3} stroke="var(--red)" strokePlacement="inside" strokeInset={6} />
          </GeometryBox>
        </Card>
        <Card cap="circle: size · startAngle · direction · strokeLinecap · easing" wide>
          <GeometryBox cap="default">
            <HoldIndicator progress={scrub} shape="circle" size={48} strokeWidth={4} stroke="var(--accent)" />
          </GeometryBox>
          <GeometryBox cap="startAngle 90, ccw">
            <HoldIndicator progress={scrub} shape="circle" size={48} strokeWidth={4} stroke="var(--accent)" startAngle={90} direction="counterclockwise" />
          </GeometryBox>
          <GeometryBox cap="linecap round">
            <HoldIndicator progress={scrub} shape="circle" size={48} strokeWidth={6} stroke="var(--accent)" strokeLinecap="round" />
          </GeometryBox>
          <GeometryBox cap="easeOutCubic">
            <HoldIndicator progress={scrub} shape="circle" size={48} strokeWidth={4} stroke="var(--accent)" easing={easeOutCubic} />
          </GeometryBox>
        </Card>
      </div>
    </>
  );
}
