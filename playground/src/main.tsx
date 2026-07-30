import { render } from 'solid-js/web';
import { KvTooltip } from '@cujuju/solidjs-kv-tooltip';
import { setSegTooltipHost } from '@cujuju/solidjs-seg-buttons';

/**
 * Every package's stylesheet, imported the way a real consumer would import it.
 *
 * Most of these are redundant — each package's `index.ts` already side-effect-imports its own
 * CSS — but the published READMEs tell consumers to import `<pkg>/styles.css` explicitly, and
 * the playground is only worth anything if it exercises the documented path. The two that are
 * NOT redundant are `glass/menu-tint.css` (not pulled by the glass index) and, of course, any
 * package whose index someone later stops self-importing.
 *
 * `hooks` and `hold-action` ship no CSS.
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

// Last, so the playground's own tokens win over any package default that is not in a
// @layer — the packages put their defaults in `@layer cujuju-defaults` precisely so an
// unlayered consumer override like this one beats them without an !important arms race.
import './theme.css';

import { App } from './App';

/**
 * Upgrade every SegButton `title` hint from a native tooltip to a KvTooltip.
 *
 * seg-buttons deliberately does NOT import kv-tooltip (see its `tooltipHost.ts`
 * — an optional peer cannot be imported without making the consumer's build
 * depend on it), so the consumer hands the component in. This is the one line a
 * real app writes, exercised here for the same reason the stylesheets above are.
 */
setSegTooltipHost(KvTooltip);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

render(() => <App />, root);
