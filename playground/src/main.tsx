import { render } from 'solid-js/web';
import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';
import { setSegTooltipHost } from '@cujuju/solidjs-seg-buttons';

/**
 * Every package's stylesheet, imported the way a consumer would. Mostly redundant (each index
 * self-imports), but the READMEs document this path. `glass/menu-tint.css` is not redundant.
 */
import '@cujuju/solidjs-anchored-popover/styles.css';
import '@cujuju/solidjs-chip-flyout/styles.css';
import '@cujuju/solidjs-collapsible/styles.css';
import '@cujuju/solidjs-context-menu/styles.css';
import '@cujuju/solidjs-editable-list-flyout/styles.css';
import '@cujuju/solidjs-editable-list-row/styles.css';
import '@cujuju/solidjs-glass/glass.css';
import '@cujuju/solidjs-glass/menu-tint.css';
import '@cujuju/solidjs-glass-menu/styles.css';
import '@cujuju/solidjs-kv-tooltip/styles.css';
import '@cujuju/solidjs-pill-date-picker/styles.css';
import '@cujuju/solidjs-pill-number-picker/styles.css';
import '@cujuju/solidjs-pill-toggle/styles.css';
import '@cujuju/solidjs-seg-buttons/styles.css';
import '@cujuju/solidjs-select-flyout/styles.css';
import '@cujuju/solidjs-tri-state-chip/styles.css';

// Last, so the playground's own tokens win over any unlayered package default — the packages
// put theirs in `@layer cujuju-defaults` for exactly this.
import './theme.css';

import { App } from './App';

/**
 * Upgrade every SegButton `title` from a native tooltip to a KvTooltip. seg-buttons cannot
 * import an optional peer (see its `tooltipHost.ts`), so the consumer hands it in.
 */
setSegTooltipHost(KvTooltip);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

render(() => <App />, root);
