import { For, createSignal, type JSX } from 'solid-js';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import { Code, Card } from '../ui';

const ROWS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'COIN'];

export function GlassMenuPage(): JSX.Element {
  const [closed, setClosed] = createSignal(0);
  let captured: HTMLDivElement | undefined;
  const [measured, setMeasured] = createSignal('—');

  return (
    <>
      <h1>@cujuju/solidjs-glass-menu</h1>
      <p class="note">
        The menu <b>surface</b> — header, optional divider, header action, close button, body. It
        is not a popover: it has no positioning and no dismiss logic of its own. That is
        deliberate; it is the panel that <code>context-menu</code>, <code>chip-flyout</code> and{' '}
        <code>select-flyout</code> put INSIDE their own positioned shells, so the surface is
        defined in exactly one place and every menu in the app looks the same by construction.
      </p>
      <Code cap="usage">{`
import { GlassMenu } from '@cujuju/solidjs-glass-menu';

<GlassMenu
  title="Panel settings"
  onClose={() => setOpen(false)}
  headerDivider
  style={{ width: '240px' }}
>
  <div style={{ padding: '10px 12px' }}>…</div>
</GlassMenu>

// Pair with AnchoredPopover when it needs to hang off a trigger:
// <AnchoredPopover …><GlassMenu …/></AnchoredPopover>
`}</Code>

      <h2>The surface, standing still</h2>
      <div class="row">
        <Card cap="title + close + divider">
          <GlassMenu
            title="Panel settings"
            onClose={() => setClosed((n) => n + 1)}
            headerDivider
            style={{ width: '240px' }}
          >
            <div style={{ padding: '10px 12px' }} class="readout">
              <div>Body content goes here.</div>
              <div>The tint is driven by the menu-tint CSS vars — see the glass page.</div>
            </div>
          </GlassMenu>
          <span class="readout">
            close clicked <b>{closed()}</b>
          </span>
        </Card>
        <Card cap="header action, no close">
          <GlassMenu
            title="Watchlist"
            headerAction={<button class="demo-btn">+ add</button>}
            style={{ width: '240px' }}
          >
            <div style={{ padding: '10px 12px' }} class="readout">
              <div>SPY · QQQ · NVDA</div>
            </div>
          </GlassMenu>
        </Card>
        <Card cap="no header at all">
          <GlassMenu style={{ width: '180px' }}>
            <div style={{ padding: '10px 12px' }} class="readout">
              bare surface
            </div>
          </GlassMenu>
        </Card>
      </div>

      <h2>
        headerDivider <small>— on when the body is dense, off when it breathes</small>
      </h2>
      <div class="row">
        <Card cap="headerDivider (a dense list needs the separation)">
          <GlassMenu title="Symbols" headerDivider style={{ width: '200px' }}>
            <div style={{ padding: '4px 0' }}>
              <For each={ROWS.slice(0, 4)}>
                {(r) => (
                  <div style={{ padding: '4px 12px' }} class="readout">
                    {r}
                  </div>
                )}
              </For>
            </div>
          </GlassMenu>
        </Card>
        <Card cap="no divider (one paragraph does not)">
          <GlassMenu title="About" style={{ width: '200px' }}>
            <div style={{ padding: '10px 12px' }} class="readout">
              A short body needs no rule above it.
            </div>
          </GlassMenu>
        </Card>
      </div>

      <h2>
        overflow <small>— hidden clips the body; visible lets a child escape</small>
      </h2>
      <p class="note">
        The default (<code>hidden</code>) is what you want for a scrolling list — the body's corners
        stay inside the surface's radius. Switch it to <code>visible</code> when a child of the
        menu must escape the box: a submenu, a tooltip, a picker's pop-out.
      </p>
      <div class="row">
        <Card cap="overflow: hidden — the long list is clipped to the radius">
          <GlassMenu title="Symbols" headerDivider overflow="hidden" style={{ width: '200px', 'max-height': '150px', 'overflow-y': 'auto' }}>
            <div style={{ padding: '4px 0' }}>
              <For each={ROWS}>
                {(r) => (
                  <div style={{ padding: '5px 12px' }} class="readout">
                    {r}
                  </div>
                )}
              </For>
            </div>
          </GlassMenu>
        </Card>
        <Card cap="overflow: visible — the badge hangs outside the surface">
          <GlassMenu title="Alerts" overflow="visible" style={{ width: '200px' }}>
            <div style={{ padding: '10px 12px', position: 'relative' }} class="readout">
              a child that escapes the box
              <span
                class="strike"
                style={{
                  position: 'absolute',
                  top: '-26px',
                  right: '-14px',
                  color: 'var(--red)',
                  'margin-left': '0',
                }}
              >
                3
              </span>
            </div>
          </GlassMenu>
        </Card>
      </div>

      <h2>
        ref + passthrough attributes <small>— it is still a div</small>
      </h2>
      <p class="note">
        <code>GlassMenu</code> extends the div's own HTML attributes, so{' '}
        <code>id</code>, <code>class</code>, <code>style</code>, <code>data-*</code> and event
        handlers all land on the surface. <code>ref</code> hands you the element — which is how a
        positioned wrapper measures the panel it is about to place.
      </p>
      <div class="row">
        <Card cap="ref — measure the surface">
          <GlassMenu
            ref={captured}
            title="Measure me"
            id="demo-measured-menu"
            data-demo="passthrough"
            style={{ width: '220px' }}
          >
            <div style={{ padding: '10px 12px' }} class="readout">
              id, data-* and style all passed straight through.
            </div>
          </GlassMenu>
          <button
            class="demo-btn"
            onClick={() =>
              setMeasured(
                captured
                  ? `${Math.round(captured.offsetWidth)} × ${Math.round(captured.offsetHeight)}`
                  : 'no ref',
              )
            }
          >
            measure
          </button>
          <span class="readout">
            offset box <b>{measured()}</b>
          </span>
        </Card>
      </div>
    </>
  );
}
