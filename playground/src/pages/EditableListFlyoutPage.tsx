import { createSignal, type JSX } from 'solid-js';
import EditableListFlyout from '@cujuju/solidjs-editable-list-flyout';
import { Card, ClipBox } from '../ui';

interface Watchlist { id: string; name: string; symbols: number }

const INITIAL: Watchlist[] = [
  { id: 'a', name: 'Core', symbols: 12 },
  { id: 'b', name: 'Earnings this week', symbols: 6 },
  { id: 'c', name: 'Index futures', symbols: 4 },
];

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function EditableListFlyoutPage(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();
  const [items, setItems] = createSignal<Watchlist[]>(INITIAL);
  const [active, setActive] = createSignal('a');
  let nextId = 4;

  return (
    <>
      <h1>@cujuju/solidjs-editable-list-flyout</h1>
      <p class="note">
        <code>anchored-popover</code> + a list of <code>editable-list-row</code>s + a create
        affordance. The whole "manage my watchlists / layouts / presets" flyout, in one
        component. Handlers are async (400ms below) so the rows show their busy state.
      </p>

      <h2>The flyout</h2>
      <div class="row">
        <Card cap="rename, delete, create">
          <button ref={setAnchor} class="demo-btn" onClick={() => setOpen((o) => !o)}>
            Watchlists ({items().length})
          </button>
          <span class="readout">active <b>{items().find((i) => i.id === active())?.name ?? '—'}</b></span>
          <EditableListFlyout
            open={open}
            anchor={anchor}
            onDismiss={() => setOpen(false)}
            items={items()}
            aria-label="Watchlists"
            itemConfig={(item) => ({
              trailingLabel: () => <span class="readout">{item.symbols}</span>,
            })}
            onActivate={(item) => { setActive(item.id); setOpen(false); }}
            onRename={async (item, name) => {
              await delay(400);
              setItems((all) => all.map((x) => (x.id === item.id ? { ...x, name } : x)));
            }}
            onDelete={async (item) => {
              await delay(400);
              setItems((all) => all.filter((x) => x.id !== item.id));
            }}
            onCreate={async (name) => {
              await delay(400);
              setItems((all) => [...all, { id: String(nextId++), name, symbols: 0 }]);
            }}
            createButtonLabel="New watchlist"
            emptyMessage="No watchlists yet."
          />
        </Card>
        <Card cap="inside overflow: hidden — the panel is top-layer">
          <ClipBox width="150px">
            <span class="readout">the trigger above still opens over this</span>
          </ClipBox>
        </Card>
      </div>
    </>
  );
}
