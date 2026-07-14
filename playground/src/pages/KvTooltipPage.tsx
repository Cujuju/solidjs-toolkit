import { createSignal, type JSX } from 'solid-js';
import { KvTooltip, KvTooltipPanel } from '@cujuju/solidjs-kv-tooltip';
import { Card, ClipBox } from '../ui';

const QUOTE = {
  Bid: '412.18',
  Ask: '412.22',
  Last: '412.20',
  Vol: '1.24M',
  IV: '18.4%',
};

export function KvTooltipPage(): JSX.Element {
  // Controlled mode: the caller owns visibility + coordinates. Useful when the trigger is not
  // a simple hover target (a virtualised table row, a canvas hit-test).
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);

  return (
    <>
      <h1>@cujuju/solidjs-kv-tooltip</h1>
      <p class="note">
        Mouse-follow key/value tooltip. Portal-rendered (so an <code>overflow: hidden</code>{' '}
        parent cannot clip it) and viewport-clamped with hysteresis, so it does not jitter when
        the cursor sits right on an edge.
      </p>

      <h2>Hover wrapper</h2>
      <div class="row">
        <Card cap="hover the symbol">
          <KvTooltip entries={QUOTE}>
            <span class="strike" style={{ 'margin-left': '0' }}>SPY</span>
          </KvTooltip>
        </Card>
        <Card cap="interactive — the panel survives the gap; you can mouse INTO it">
          <KvTooltip
            entries={QUOTE}
            interactive
            extraContent={
              <button class="demo-btn" onClick={() => alert('clicked inside the tooltip')}>
                a real button
              </button>
            }
          >
            <span class="strike" style={{ 'margin-left': '0' }}>QQQ</span>
          </KvTooltip>
        </Card>
        <Card cap="inside overflow: hidden — portalled, so it escapes">
          <ClipBox width="120px">
            <KvTooltip entries={QUOTE}>
              <span class="strike" style={{ 'margin-left': '0' }}>NVDA</span>
            </KvTooltip>
          </ClipBox>
        </Card>
      </div>

      <h2>
        Controlled panel <small>(caller owns x/y + visibility)</small>
      </h2>
      <div class="row">
        <Card cap="move the cursor over the canvas">
          <div
            class="canvas"
            onMouseMove={(e) => setAt({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setAt(null)}
          >
            hit-test surface — no hover wrapper, no DOM trigger
          </div>
          {at() && <KvTooltipPanel entries={QUOTE} x={at()!.x} y={at()!.y} />}
        </Card>
      </div>
    </>
  );
}
