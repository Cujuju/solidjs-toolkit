import type { JSX } from 'solid-js';
import { GlassMenu } from '@cujuju/solidjs-glass-menu';
import { Card } from '../ui';

export function GlassMenuPage(): JSX.Element {
  return (
    <>
      <h1>@cujuju/solidjs-glass-menu</h1>
      <p class="note">
        The menu <b>surface</b> — header, optional divider, close button, body. It is not a
        popover: it has no positioning and no dismiss logic of its own. That is deliberate;
        it is the panel that <code>context-menu</code>, <code>chip-flyout</code> and{' '}
        <code>select-flyout</code> put INSIDE their own positioned shells, so the surface is
        defined in exactly one place.
      </p>

      <h2>The surface, standing still</h2>
      <div class="row">
        <Card cap="title + close + divider">
          <GlassMenu
            title="Panel settings"
            onClose={() => alert('close')}
            headerDivider
            style={{ width: '240px' }}
          >
            <div style={{ padding: '10px 12px' }} class="readout">
              <div>Body content goes here.</div>
              <div>The tint is driven by the menu-tint CSS vars — see the glass page.</div>
            </div>
          </GlassMenu>
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
            <div style={{ padding: '10px 12px' }} class="readout">bare surface</div>
          </GlassMenu>
        </Card>
      </div>
    </>
  );
}
