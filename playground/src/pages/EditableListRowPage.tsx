import { For, createSignal, type JSX } from 'solid-js';
import { EditableListRow } from '@cujuju/solidjs-editable-list-row';
import { Card } from '../ui';

interface Item { id: string; name: string; checked: boolean }

const INITIAL: Item[] = [
  { id: '1', name: 'Momentum', checked: true },
  { id: '2', name: 'Mean reversion', checked: false },
  { id: '3', name: 'Earnings plays', checked: true },
];

/** The rename/delete handlers are async on purpose — the row shows a busy state while they
 *  are in flight, which is the whole reason it owns them rather than exposing raw callbacks. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function EditableListRowPage(): JSX.Element {
  const [items, setItems] = createSignal<Item[]>(INITIAL);
  const [active, setActive] = createSignal('1');

  return (
    <>
      <h1>@cujuju/solidjs-editable-list-row</h1>
      <p class="note">
        One row of a manageable list: inline rename, delete-with-confirm, an optional selection
        control, a trailing label, and a busy state while an async handler is in flight. The
        rename and delete handlers below are artificially slow (400ms) so the busy state is
        visible.
      </p>

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
    </>
  );
}
