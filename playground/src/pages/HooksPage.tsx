import { createSignal, type JSX } from 'solid-js';
import {
  createDebounce,
  createDocumentVisibility,
  createLocalStorage,
  createMediaQuery,
} from '@cujuju/solidjs-hooks';
import { Card } from '../ui';

/** Long enough that the debounced value visibly lags the raw one while typing. */
const DEBOUNCE_MS = 400;
const NARROW_QUERY = '(max-width: 900px)';

export function HooksPage(): JSX.Element {
  const [raw, setRaw] = createSignal('');
  const debounced = createDebounce(raw, DEBOUNCE_MS);
  const narrow = createMediaQuery(NARROW_QUERY);
  const visibility = createDocumentVisibility();
  const [persisted, setPersisted] = createLocalStorage('playground:hooks:note', 'edit me');

  return (
    <>
      <h1>@cujuju/solidjs-hooks</h1>
      <p class="note">
        The primitive drawer — no UI of its own. <code>createClickOutside</code>,{' '}
        <code>createEscapeKey</code>, <code>createHotkey</code>, <code>createLocalStorage</code>,{' '}
        <code>createPersistedSet</code> / <code>Map</code>, <code>createMediaQuery</code>,{' '}
        <code>createResizeObserver</code>, <code>createIntersectionObserver</code>,{' '}
        <code>createDebounce</code>, <code>createDebouncedCallback</code>,{' '}
        <code>createDocumentVisibility</code>, <code>createAsyncStatus</code>,{' '}
        <code>createAfterPaint</code>, <code>createOutsideScrollDismiss</code>. Four of them are
        live below.
      </p>

      <h2>Live</h2>
      <div class="row">
        <Card cap={`createDebounce — ${DEBOUNCE_MS}ms`}>
          <input
            class="demo-btn"
            style={{ cursor: 'text' }}
            value={raw()}
            placeholder="type fast"
            onInput={(e) => setRaw(e.currentTarget.value)}
          />
          <span class="readout">
            raw <b>{raw() || '—'}</b>
            <br />debounced <b>{debounced() || '—'}</b>
          </span>
        </Card>
        <Card cap="createLocalStorage — survives a reload">
          <input
            class="demo-btn"
            style={{ cursor: 'text' }}
            value={persisted()}
            onInput={(e) => setPersisted(e.currentTarget.value)}
          />
          <span class="readout">key <b>playground:hooks:note</b></span>
        </Card>
        <Card cap="createMediaQuery — resize the window">
          <span class="readout">
            <code>{NARROW_QUERY}</code> → <b>{String(narrow())}</b>
          </span>
        </Card>
        <Card cap="createDocumentVisibility — switch tabs and come back">
          <span class="readout">
            document is <b>{visibility()}</b>
          </span>
        </Card>
      </div>
    </>
  );
}
