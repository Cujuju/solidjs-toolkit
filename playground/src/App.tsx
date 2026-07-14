import { For, Show, createSignal, onCleanup, type Component, type JSX } from 'solid-js';

import { AnchoredPopoverPage } from './pages/AnchoredPopoverPage';
import { ChipFlyoutPage } from './pages/ChipFlyoutPage';
import { CollapsiblePage } from './pages/CollapsiblePage';
import { ContextMenuPage } from './pages/ContextMenuPage';
import { EditableListFlyoutPage } from './pages/EditableListFlyoutPage';
import { EditableListRowPage } from './pages/EditableListRowPage';
import { GlassPage } from './pages/GlassPage';
import { GlassMenuPage } from './pages/GlassMenuPage';
import { HoldActionPage } from './pages/HoldActionPage';
import { HooksPage } from './pages/HooksPage';
import { KvTooltipPage } from './pages/KvTooltipPage';
import { PillDatePickerPage } from './pages/PillDatePickerPage';
import { PillNumberPickerPage } from './pages/PillNumberPickerPage';
import { PillTogglePage } from './pages/PillTogglePage';
import { SegButtonsPage } from './pages/SegButtonsPage';
import { SelectFlyoutPage } from './pages/SelectFlyoutPage';
import { TriStateChipPage } from './pages/TriStateChipPage';

/**
 * Playground — the live harness for the toolkit packages.
 *
 * Everything here is aimed at the cases that a unit test cannot show you and a static mock
 * cannot prove: how a control behaves inside HOSTILE ancestors (clipping, scrolling, a viewport
 * edge), at the density it will actually ship in, with real theme tokens.
 *
 * Packages are consumed FROM SOURCE via the `solid` export condition (see vite.config.ts), so
 * an edit in `packages/*\/src` hot-reloads here with no build, no publish, and no linking into a
 * consuming app.
 *
 * ONE page per package. If a package has no page, it is invisible here — and a control nobody
 * looks at is a control nobody notices breaking.
 */

interface Page {
  /** URL hash + nav key. Matches the package directory name. */
  id: string;
  /** One-line "what is it", shown under the nav entry. */
  blurb: string;
  component: Component;
}

/** Ordered by how much there is to look at, not alphabetically — the two pickers carry the
 *  interesting behaviour (portalled pop-outs in hostile ancestors) and are what someone opening
 *  this is usually here for. */
const PAGES: Page[] = [
  { id: 'pill-date-picker', blurb: 'expiration + DTE', component: PillDatePickerPage },
  { id: 'pill-number-picker', blurb: 'stepper', component: PillNumberPickerPage },
  { id: 'anchored-popover', blurb: 'placement primitive', component: AnchoredPopoverPage },
  { id: 'context-menu', blurb: 'right-click menu', component: ContextMenuPage },
  { id: 'select-flyout', blurb: 'themed select', component: SelectFlyoutPage },
  { id: 'chip-flyout', blurb: 'filter chips', component: ChipFlyoutPage },
  { id: 'tri-state-chip', blurb: 'in / out / off', component: TriStateChipPage },
  { id: 'kv-tooltip', blurb: 'key/value hover', component: KvTooltipPage },
  { id: 'editable-list-flyout', blurb: 'manage-a-list panel', component: EditableListFlyoutPage },
  { id: 'editable-list-row', blurb: 'rename / delete row', component: EditableListRowPage },
  { id: 'collapsible', blurb: 'disclosure section', component: CollapsiblePage },
  { id: 'seg-buttons', blurb: 'segmented control', component: SegButtonsPage },
  { id: 'pill-toggle', blurb: 'switch', component: PillTogglePage },
  { id: 'hold-action', blurb: 'press-and-hold', component: HoldActionPage },
  { id: 'glass-menu', blurb: 'menu surface', component: GlassMenuPage },
  { id: 'glass', blurb: 'surfaces + tint engine', component: GlassPage },
  { id: 'hooks', blurb: 'primitive drawer', component: HooksPage },
];

const DEFAULT_PAGE = PAGES[0].id;

/** Routing is the URL hash and nothing else. No router dependency: the toolkit has none, and a
 *  16-line signal buys the one thing that actually matters here — a reload (or a hot-reload)
 *  puts you back on the page you were looking at instead of dumping you at the top. */
function currentIdFromHash(): string {
  const id = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((p) => p.id === id) ? id : DEFAULT_PAGE;
}

export function App(): JSX.Element {
  const [id, setId] = createSignal(currentIdFromHash());

  const onHashChange = (): void => {
    setId(currentIdFromHash());
  };
  window.addEventListener('hashchange', onHashChange);
  onCleanup(() => window.removeEventListener('hashchange', onHashChange));

  const navigate = (next: string): void => {
    window.location.hash = `/${next}`;
    // The hashchange event covers the back button and a pasted URL; this covers the case where
    // the hash is already what we are setting it to (a re-click on the current page), which
    // fires no event at all.
    setId(next);
    window.scrollTo(0, 0);
  };

  const active = (): Page => PAGES.find((p) => p.id === id()) ?? PAGES[0];

  return (
    <div class="shell">
      <nav class="nav">
        <h1>solidjs-toolkit</h1>
        <For each={PAGES}>
          {(p) => (
            <button
              class="nav-item"
              aria-current={p.id === id() ? 'page' : undefined}
              onClick={() => navigate(p.id)}
            >
              {p.id}
              <small>{p.blurb}</small>
            </button>
          )}
        </For>
      </nav>

      <main class="page">
        {/* Keyed on the page id so switching pages REMOUNTS rather than diffing one control's
            state onto another's. A stale open pop-out surviving a page switch would be a
            playground bug that looks exactly like a package bug. */}
        <Show when={active()} keyed>
          {(p) => <p.component />}
        </Show>
      </main>
    </div>
  );
}
