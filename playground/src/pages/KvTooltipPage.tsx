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

/** A quote that has not arrived yet — every value blank. `showEmpty` decides whether the panel
 *  renders the keys anyway (a stable skeleton) or refuses to show at all. */
const EMPTY_QUOTE = { Bid: '', Ask: '', Last: '', Vol: '', IV: '' };

const LONG = {
  Strategy: 'Iron condor — 6200/6250 put spread, 6300/6350 call spread, 45 DTE',
  Note: 'Rolled up from the 6150/6200 spread on the 12th after the gap.',
};

/** Far enough off the cursor that the panel never sits under the pointer itself. */
const FAR_OFFSET_X = 28;
const FAR_OFFSET_Y = 28;

export function KvTooltipPage(): JSX.Element {
  // Controlled mode: the caller owns visibility + coordinates. Useful when the trigger is not
  // a simple hover target (a virtualised table row, a canvas hit-test).
  const [at, setAt] = createSignal<{ x: number; y: number } | null>(null);
  const [disabled, setDisabled] = createSignal(false);

  return (
    <>
      <h1>@cujuju/solidjs-kv-tooltip</h1>
      <p class="note">
        Mouse-follow key/value tooltip. Portal-rendered (so an <code>overflow: hidden</code> parent
        cannot clip it) and viewport-clamped with hysteresis, so it does not jitter when the cursor
        sits right on an edge. Two entry points: the <code>KvTooltip</code> hover wrapper, and the
        bare <code>KvTooltipPanel</code> for when there is no DOM element to hover.
      </p>

      <h2>Hover wrapper</h2>
      <div class="row">
        <Card cap="hover the symbol">
          <KvTooltip entries={QUOTE}>
            <span class="strike" style={{ 'margin-left': '0' }}>
              SPY
            </span>
          </KvTooltip>
        </Card>
        <Card cap="interactive — the panel survives the gap; you can mouse INTO it">
          <KvTooltip
            entries={QUOTE}
            interactive
            hideDelayMs={220}
            extraContent={
              <button class="demo-btn" onClick={() => alert('clicked inside the tooltip')}>
                a real button
              </button>
            }
          >
            <span class="strike" style={{ 'margin-left': '0' }}>
              QQQ
            </span>
          </KvTooltip>
        </Card>
        <Card cap="inside overflow: hidden — portalled, so it escapes">
          <ClipBox width="120px">
            <KvTooltip entries={QUOTE}>
              <span class="strike" style={{ 'margin-left': '0' }}>
                NVDA
              </span>
            </KvTooltip>
          </ClipBox>
        </Card>
      </div>
      <p class="note">
        <code>interactive</code> is what makes the second one reachable: without it, moving the
        cursor off the trigger and toward the panel crosses a gap with no hover target and the
        panel vanishes mid-journey. With it, a <code>hideDelayMs</code> grace period keeps the
        panel alive long enough to arrive.
      </p>

      <h2>Empty + disabled</h2>
      <div class="row">
        <Card cap="showEmpty — a skeleton while the quote is still in flight">
          <KvTooltip entries={EMPTY_QUOTE} showEmpty>
            <span class="strike" style={{ 'margin-left': '0' }}>
              LOADING
            </span>
          </KvTooltip>
        </Card>
        <Card cap="without showEmpty — no panel at all">
          <KvTooltip entries={EMPTY_QUOTE}>
            <span class="strike" style={{ 'margin-left': '0' }}>
              SILENT
            </span>
          </KvTooltip>
        </Card>
        <Card cap="disabled — a reactive gate">
          <KvTooltip entries={QUOTE} disabled={disabled()}>
            <span class="strike" style={{ 'margin-left': '0' }}>
              AAPL
            </span>
          </KvTooltip>
          <button class="demo-btn" onClick={() => setDisabled((d) => !d)}>
            {disabled() ? 'enable' : 'disable'} it
          </button>
        </Card>
      </div>

      <h2>Geometry</h2>
      <div class="row">
        <Card cap="mouseOffsetX / Y — pushed clear of the cursor">
          <KvTooltip entries={QUOTE} mouseOffsetX={FAR_OFFSET_X} mouseOffsetY={FAR_OFFSET_Y}>
            <span class="strike" style={{ 'margin-left': '0' }}>
              OFFSET
            </span>
          </KvTooltip>
        </Card>
        <Card cap="minWidth — a narrow panel that still lines up in a column">
          <KvTooltip entries={{ Δ: '0.42', Θ: '-0.08' }} minWidth={180}>
            <span class="strike" style={{ 'margin-left': '0' }}>
              GREEKS
            </span>
          </KvTooltip>
        </Card>
        <Card cap="maxWidth — long values wrap instead of running off">
          <KvTooltip entries={LONG} maxWidth={260}>
            <span class="strike" style={{ 'margin-left': '0' }}>
              POSITION
            </span>
          </KvTooltip>
        </Card>
        <Card cap="edgePadPx + hysteresisPx — drag toward the window edge">
          <KvTooltip entries={QUOTE} edgePadPx={24} hysteresisPx={12}>
            <span class="strike" style={{ 'margin-left': '0' }}>
              EDGE
            </span>
          </KvTooltip>
        </Card>
      </div>
      <p class="note">
        The hysteresis is the reason the panel does not strobe when the cursor hovers exactly on
        the flip threshold near an edge: the panel must be pushed{' '}
        <code>hysteresisPx</code> past the boundary before it will flip back, so a one-pixel cursor
        tremor cannot oscillate it.
      </p>

      <h2>
        Controlled panel <small>(caller owns x/y + visibility)</small>
      </h2>
      <p class="note">
        There is no DOM element under the cursor to attach a hover to — the "rows" are painted
        pixels. So the caller hit-tests, and drives the panel directly. This is the shape a canvas
        chart or a virtualised table needs; <code>role="status"</code> because the content changes
        under a stationary cursor.
      </p>
      <div class="row">
        <Card cap="move the cursor over the canvas">
          <div
            class="canvas"
            onMouseMove={(e) => setAt({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setAt(null)}
          >
            hit-test surface — no hover wrapper, no DOM trigger
          </div>
          {at() && (
            <KvTooltipPanel
              entries={{ ...QUOTE, X: String(Math.round(at()!.x)), Y: String(Math.round(at()!.y)) }}
              x={at()!.x}
              y={at()!.y}
              role="status"
              minWidth={160}
            />
          )}
        </Card>
      </div>
    </>
  );
}
