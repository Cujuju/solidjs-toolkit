import { createSignal, createMemo, onCleanup, For, type JSX } from 'solid-js';
import { KvTooltip, KvTooltipPanel } from '@cujuju/solidjs-kv-tooltip';
import { Card, ClipBox, EdgeRight, ScrollBox } from '../ui';

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

  // ── 0.2.0 demos ───────────────────────────────────────────────────────────
  // Anchors are read through accessors, not captured once, so the rect stays
  // honest across resize and scroll.
  let anchorFieldA: HTMLDivElement | undefined;
  let anchorFieldB: HTMLDivElement | undefined;
  let anchorFieldC: HTMLDivElement | undefined;
  let fakeMenu: HTMLDivElement | undefined;

  /** The native popover is positioned under the field it belongs to, like a real select menu. */
  const [menuAt, setMenuAt] = createSignal({ top: 0, left: 0 });
  const menuTop = (): number => menuAt().top;
  const menuLeft = (): number => menuAt().left;
  const positionMenu = (): void => {
    const r = anchorFieldA?.getBoundingClientRect();
    if (r) setMenuAt({ top: r.bottom + 4, left: r.left });
  };

  /** A quote that ticks 10x/s — the exact source shape `freezeOnShow` exists for. */
  const [tick, setTick] = createSignal(0);
  const timer = setInterval(() => setTick((n) => n + 1), 100);
  onCleanup(() => clearInterval(timer));
  const ticking = createMemo(() => ({
    ...QUOTE,
    Last: (412.2 + (tick() % 20) / 100).toFixed(2),
    Tick: String(tick()),
  }));

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

      <h2>Anchored placement <small>(0.2.0)</small></h2>
      <p class="note">
        The tooltip takes a SIDE OF THE TRIGGER'S RECT instead of following the cursor, so a
        menu can take the other side and neither covers the other. This is not a z-index
        problem: the anchored-popover menu paints in the browser TOP LAYER, which no
        stacking-context z-index can beat. Placement is the only fix.
      </p>
      <div class="row">
        <Card cap="tooltip ABOVE the field, menu BELOW it — hover, then click">
          <div ref={anchorFieldA} style={{ display: 'inline-block' }}>
            <KvTooltip
              entries={QUOTE}
              anchor={() => anchorFieldA?.getBoundingClientRect() ?? null}
              placement="above-start"
              hideOnPointerDown
              suppressWhileTopLayerOpen
            >
              <span class="strike" style={{ 'margin-left': '0' }}>
                SPY ▾
              </span>
            </KvTooltip>
          </div>
          <button
            class="demo-btn"
            onClick={() => {
              const el = fakeMenu;
              if (!el) return;
              if (el.matches(':popover-open')) {
                el.hidePopover();
              } else {
                positionMenu();
                el.showPopover();
              }
            }}
          >
            toggle the menu
          </button>
          {/* A real native popover — the actual top-layer surface the tooltip must dodge. */}
          <div
            ref={fakeMenu}
            popover="manual"
            style={{
              margin: '0',
              position: 'fixed',
              background: 'var(--panel, #1e293b)',
              border: '1px solid var(--border, #334155)',
              'border-radius': '5px',
              padding: '6px 10px',
              inset: 'auto',
              top: `${menuTop()}px`,
              left: `${menuLeft()}px`,
            }}
          >
            a native [popover] menu — top layer
          </div>
        </Card>

        <Card cap="near the TOP edge — above-start must flip BELOW, not slide onto the anchor">
          <div ref={anchorFieldB} style={{ display: 'inline-block' }}>
            <KvTooltip
              entries={QUOTE}
              anchor={() => anchorFieldB?.getBoundingClientRect() ?? null}
              placement="above-start"
            >
              <span class="strike" style={{ 'margin-left': '0' }}>
                TOP-EDGE
              </span>
            </KvTooltip>
          </div>
          <p class="note">
            Scroll this page so the trigger sits near the top of the window, then hover. The
            old clamp had no flip here — it slid the panel down onto its own anchor.
          </p>
        </Card>

        <Card cap="below-end near the RIGHT edge — start-align switches to end-align">
          <EdgeRight>
            <div ref={anchorFieldC} style={{ display: 'inline-block' }}>
              <KvTooltip
                entries={LONG}
                maxWidth={260}
                anchor={() => anchorFieldC?.getBoundingClientRect() ?? null}
                placement="below-start"
              >
                <span class="strike" style={{ 'margin-left': '0' }}>
                  RIGHT-EDGE
                </span>
              </KvTooltip>
            </div>
          </EdgeRight>
        </Card>
      </div>

      <h2>Delay, freeze, dismissal <small>(0.2.0)</small></h2>
      <div class="row">
        <Card cap="showDelayMs — sweep across the row; nothing flashes">
          <For each={['AAPL', 'MSFT', 'GOOG', 'AMZN', 'META']}>
            {(sym) => (
              <KvTooltip entries={QUOTE} showDelayMs={350}>
                <span class="strike">{sym}</span>
              </KvTooltip>
            )}
          </For>
          <p class="note">
            Pass the cursor straight through and no panel appears. Rest on one for 350ms and it
            does. Compare with the un-delayed row above, which flashes five panels.
          </p>
        </Card>

        <Card cap="freezeOnShow — the Last value ticks 10x/s">
          <KvTooltip entries={ticking()} freezeOnShow>
            <span class="strike" style={{ 'margin-left': '0' }}>
              FROZEN
            </span>
          </KvTooltip>
          <KvTooltip entries={ticking()}>
            <span class="strike">LIVE</span>
          </KvTooltip>
          <p class="note">
            FROZEN captures the quote at hover and holds it — no re-measure, no twitch. LIVE is
            the 0.1.0 behaviour: the panel re-measures and repositions on every tick.
          </p>
        </Card>

        <Card cap="hideOnScroll — inside a real scroll container">
          <ScrollBox fill={14}>
            <KvTooltip entries={QUOTE} hideOnScroll>
              <span class="strike" style={{ 'margin-left': '0' }}>
                ROW-1
              </span>
            </KvTooltip>
            <KvTooltip entries={QUOTE}>
              <span class="strike">ROW-2 (stays)</span>
            </KvTooltip>
          </ScrollBox>
          <p class="note">
            Open ROW-1's tooltip and scroll: it dismisses. ROW-2's is stranded mid-air over
            unrelated rows — the 0.1.0 behaviour.
          </p>
        </Card>
      </div>

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
