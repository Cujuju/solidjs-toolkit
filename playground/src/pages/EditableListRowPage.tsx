import { For, createSignal, type JSX } from 'solid-js';
import { EditableListRow } from '@cujuju/solidjs-editable-list-row';
import { Code, Card } from '../ui';

interface Item { id: string; name: string; checked: boolean }

const INITIAL: Item[] = [
  { id: '1', name: 'Momentum', checked: true },
  { id: '2', name: 'Mean reversion', checked: false },
  { id: '3', name: 'Earnings plays', checked: true },
];

/** The rename/delete handlers are async on purpose — the row shows a busy state while they are
 *  in flight, which is why it owns them. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function EditableListRowPage(): JSX.Element {
  const [items, setItems] = createSignal<Item[]>(INITIAL);
  const [active, setActive] = createSignal('1');
  const [busy, setBusy] = createSignal(false);
  const [renameNow, setRenameNow] = createSignal(false);
  const [starred, setStarred] = createSignal(false);
  const [allowDelete, setAllowDelete] = createSignal(false);
  const [lastEvent, setLastEvent] = createSignal('—');

  return (
    <>
      <h1>@cujuju/solidjs-editable-list-row</h1>
      <p class="note">
        One row of a manageable list: inline rename, delete-with-confirm, an optional selection
        control, a trailing label, and a busy state while an async handler is in flight. The
        rename and delete handlers below are artificially slow (400ms) so the busy state is
        visible.
      </p>
      <Code cap="usage">{`
import EditableListRow from '@cujuju/solidjs-editable-list-row';

<EditableListRow
  id={it.id}
  name={it.name}
  active={active() === it.id}
  onActivate={() => setActive(it.id)}
  selection={{
    kind: 'checkbox',
    checked: it.checked,
    onToggle: (next) => …,
  }}
  onRename={(name) => …}
  onDelete={() => …}
/>
`}</Code>

      <h2>Rows</h2>
      <div class="row">
        <Card cap="checkbox selection · rename · delete">
          <div style={{ width: '300px' }}>
            <For each={items()}>
              {(it) => (
                <EditableListRow
                  id={it.id}
                  name={it.name}
                  active={active() === it.id}
                  onActivate={() => setActive(it.id)}
                  selection={{
                    kind: 'checkbox',
                    checked: it.checked,
                    onToggle: (next) =>
                      setItems((all) =>
                        all.map((x) => (x.id === it.id ? { ...x, checked: next } : x)),
                      ),
                  }}
                  trailingLabel={() => <span class="readout">{it.checked ? 'on' : 'off'}</span>}
                  onRename={async (next) => {
                    await delay(400);
                    setItems((all) =>
                      all.map((x) => (x.id === it.id ? { ...x, name: next } : x)),
                    );
                  }}
                  onDelete={async () => {
                    await delay(400);
                    setItems((all) => all.filter((x) => x.id !== it.id));
                  }}
                />
              )}
            </For>
          </div>
        </Card>
        <Card cap="no selection control, delete disabled">
          <div style={{ width: '300px' }}>
            <EditableListRow
              id="fixed"
              name="Default (cannot be deleted)"
              selection={{ kind: 'none' }}
              deleteDisabled
              infoTooltip="The default list is not deletable."
              onRename={async () => { await delay(200); }}
              onDelete={async () => {}}
            />
          </div>
        </Card>
      </div>

      <h2>Slots, outside control, confirm</h2>
      <Code cap="more props">{`
<EditableListRow id="a" name="Watchlist" selection={{ kind: 'none' }}
  leadingIcon={() => <ListIcon />}            // or leadingControl={() => <StarButton />} (wins)
  reorderProps={sortable.itemProps}           // spread onto the row; shows a drag handle
  onContextMenu={(e) => openMenu(e)}
  busy={() => saving()}                       // blocks rename/delete while true
  pendingRename={() => renameRequested()}     // false → true enters rename
  onRenameClose={() => setRenameRequested(false)}
  deleteConfirmTitle="Remove list" deleteConfirmMessage="Remove Watchlist and its 12 symbols?"
  confirmDelete={async ({ title, message }) => myDialog.ask(title, message)}  // default: window.confirm
  renameAriaLabel="Rename watchlist" deleteAriaLabel="Remove watchlist"
  onRename={…} onDelete={…} />
`}</Code>
      <div class="row">
        <Card cap="leadingIcon · reorderProps · onContextMenu · aria labels · confirm title/message (window.confirm)">
          <div style={{ width: '320px' }}>
            <EditableListRow
              id="slots"
              name="Watchlist"
              selection={{ kind: 'none' }}
              leadingIcon={() => <span aria-hidden="true">☰</span>}
              reorderProps={{ 'data-demo-reorder': '' }}
              onContextMenu={(e) => { e.preventDefault(); setLastEvent('onContextMenu'); }}
              renameAriaLabel="Rename watchlist"
              deleteAriaLabel="Remove watchlist"
              deleteConfirmTitle="Remove list"
              deleteConfirmMessage="Remove Watchlist and its 12 symbols?"
              onRename={async () => { setLastEvent('onRename'); }}
              onDelete={async () => { setLastEvent('onDelete'); }}
            />
            <span class="readout">last <b>{lastEvent()}</b></span>
          </div>
        </Card>
        <Card cap="leadingControl · busy · pendingRename/onRenameClose · custom confirmDelete">
          <div style={{ width: '320px' }}>
            <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'margin-bottom': '8px' }}>
              <button class="demo-btn" onClick={() => setRenameNow(true)}>Rename from outside</button>
              <label><input type="checkbox" checked={busy()} onChange={(e) => setBusy(e.currentTarget.checked)} /> busy</label>
              <label><input type="checkbox" checked={allowDelete()} onChange={(e) => setAllowDelete(e.currentTarget.checked)} /> confirm says yes</label>
            </div>
            <EditableListRow
              id="driven"
              name="Earnings"
              selection={{ kind: 'none' }}
              leadingControl={() => (
                <button type="button" aria-pressed={starred()} aria-label="Star" onClick={() => setStarred((v) => !v)}>
                  {starred() ? '★' : '☆'}
                </button>
              )}
              busy={busy}
              pendingRename={renameNow}
              onRenameClose={() => { setRenameNow(false); setLastEvent('onRenameClose'); }}
              confirmDelete={async ({ title, message }) => { setLastEvent(`confirmDelete: ${title} / ${message}`); return allowDelete(); }}
              onRename={async () => { setLastEvent('onRename'); }}
              onDelete={async () => { setLastEvent('onDelete'); }}
            />
            <span class="readout">pendingRename <b>{String(renameNow())}</b></span>
          </div>
        </Card>
      </div>
    </>
  );
}
