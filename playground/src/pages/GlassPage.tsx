import type { JSX } from 'solid-js';
import { MenuTintSection } from '@cujuju/solidjs-glass';
import { Code, Card } from '../ui';

const STORAGE_KEY = 'playground:menuTint';

export function GlassPage(): JSX.Element {
  return (
    <>
      <h1>@cujuju/solidjs-glass</h1>
      <p class="note">
        The glass surfaces (<code>.glass-panel</code>, <code>.glass-menu</code>) plus the
        menu-tint engine: five knobs (darken, alpha, saturate, backdrop-saturate, blur) written
        straight into CSS custom properties, persisted to localStorage, and read by every menu
        surface in the toolkit. Drag a slider and watch the panels above it change — the tint is
        global by construction, because it lives on <code>:root</code>.
      </p>
      <Code cap="usage">{`
import { MenuTintSection } from '@cujuju/solidjs-glass';
import '@cujuju/solidjs-glass/glass.css';

// Surfaces are CLASSES, not components — put them on your own element:
<div class="glass-panel">a panel on the glass surface</div>
<div class="glass-menu">the smoked-glass menu surface</div>

// The five tint knobs, as a ready-made settings section:
<MenuTintSection storageKey="app:menuTint" />

// …or drive them yourself:
// :root { --user-menu-tint-darken: 35%; --user-menu-tint-alpha: 35%;
//         --user-menu-tint-saturate: 1; --user-menu-tint-blur: 10px; }
`}</Code>

      <h2>The surfaces</h2>
      <div class="row">
        <Card cap=".glass-panel">
          <div class="glass-panel" style={{ width: '220px', padding: '14px' }}>
            <div class="readout">a panel on the glass surface</div>
          </div>
        </Card>
        <Card cap=".glass-menu">
          <div class="glass-menu" style={{ width: '220px', padding: '14px' }}>
            <div class="readout">a menu on the glass surface</div>
          </div>
        </Card>
      </div>

      <h2>
        The tint engine <small>(persisted — reload and it survives)</small>
      </h2>
      <div class="row">
        <Card cap="MenuTintSection">
          <div style={{ width: '420px' }}>
            <MenuTintSection storageKey={STORAGE_KEY} />
          </div>
        </Card>
      </div>
    </>
  );
}
