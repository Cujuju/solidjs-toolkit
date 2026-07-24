import { createSignal, type JSX } from 'solid-js';
import EditableListFlyout from '@cujuju/solidjs-editable-list-flyout';
import {
  Card,
  ClipBox,
  EdgeRight,
  EventLog,
  ScrollBox,
  createEventLog,
  type EventLogApi,
} from '../ui';

interface Watchlist { id: string; name: string; symbols: number }

const INITIAL: Watchlist[] = [
  { id: 'a', name: 'Core', symbols: 12 },
  { id: 'b', name: 'Earnings this week', symbols: 6 },
  { id: 'c', name: 'Index futures', symbols: 4 },
  { id: 'd', name: 'A watchlist whose name is much too long for the row it lives in', symbols: 1 },
];

/** The handlers are async because the component's contract is async: it shows a busy state on the
 *  row until the promise settles. A synchronous stub would hide exactly that. */
const HANDLER_LATENCY_MS = 400;
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One self-contained flyout, so the same thing can be dropped into each hostile box. */
function Lists(props: { log: EventLogApi; tag: string; items: Watchlist[]; empty?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();
  const [items, setItems] = createSignal<Watchlist[]>(props.empty ? [] : props.items);
  let nextId = 10;

  return (
    <>
      <button
        ref={setAnchor}
        class="demo-btn"
        onClick={() => {
          const next = !open();
          setOpen(next);
          props.log.log(next ? 'open' : 'close', { who: props.tag, via: 'trigger' });
        }}
      >
        Watchlists ({items().length})
      </button>
      <EditableListFlyout
        open={open}
        anchor={anchor}
        onDismiss={() => {
          setOpen(false);
          props.log.log('onDismiss', { who: props.tag, cause: 'escape-or-outside' });
        }}
        items={items()}
        aria-label="Watchlists"
        itemConfig={(item) => ({
          trailingLabel: () => <span class="readout">{item.symbols}</span>,
          // The last row is undeletable, so the disabled-delete branch is always on screen.
          deleteDisabled: item.id === 'a',
          infoTooltip: item.id === 'a' ? 'The default list cannot be deleted.' : undefined,
        })}
        onActivate={(item) => {
          props.log.log('onActivate', { id: item.id, name: item.name });
          setOpen(false);
        }}
        onRename={async (item, name) => {
          props.log.log('onRename:start', { id: item.id, to: name });
          await delay(HANDLER_LATENCY_MS);
          setItems((all) => all.map((x) => (x.id === item.id ? { ...x, name } : x)));
          props.log.log('onRename:done', { id: item.id });
        }}
        onDelete={async (item) => {
          props.log.log('onDelete:start', { id: item.id });
          await delay(HANDLER_LATENCY_MS);
          setItems((all) => all.filter((x) => x.id !== item.id));
          props.log.log('onDelete:done', { id: item.id });
        }}
        onCreate={async (name) => {
          props.log.log('onCreate:start', name);
          await delay(HANDLER_LATENCY_MS);
          setItems((all) => [...all, { id: String(nextId++), name, symbols: 0 }]);
          props.log.log('onCreate:done', name);
        }}
        createButtonLabel="New watchlist"
        emptyMessage="No watchlists yet."
      />
    </>
  );
}

export function EditableListFlyoutPage(): JSX.Element {
  const log = createEventLog();

  return (
    <>
      <h1>@cujuju/solidjs-editable-list-flyout</h1>
      <p class="note">
        <code>anchored-popover</code> + a list of <code>editable-list-row</code>s + a create
        affordance: the whole "manage my watchlists / layouts / presets" panel. Because it is
        built on <code>anchored-popover</code>, it inherits that package's scroll behaviour —
        see section 2.
      </p>

      <h2>1 · Variants</h2>
      <p class="note">
        Rename inline, delete with confirmation, create a new row, an undeletable row with an info
        tooltip, a name too long for its row, and the empty state. Every handler takes{' '}
        {HANDLER_LATENCY_MS}ms so the row's busy state is visible rather than theoretical.
      </p>
      <div class="row">
        <Card cap="populated — rename / delete / create / undeletable row">
          <Lists log={log} tag="main" items={INITIAL} />
        </Card>
        <Card cap="empty — emptyMessage, create still available">
          <Lists log={log} tag="empty" items={[]} empty />
        </Card>
      </div>

      <h2>2 · Hostile ancestors</h2>
      <div class="row">
        <Card cap="overflow: hidden — escapes (top layer)">
          <ClipBox width="170px">
            <Lists log={log} tag="in-clip" items={INITIAL} />
          </ClipBox>
        </Card>
        <Card cap="⚠ overflow-y: auto — open it, THEN SCROLL. It does not follow.">
          <ScrollBox width="230px" height="160px">
            <div style={{ padding: '10px' }}>
              <Lists log={log} tag="in-scrollbox" items={INITIAL} />
            </div>
          </ScrollBox>
        </Card>
        <Card cap="right viewport edge — clamps" wide>
          <EdgeRight>
            <Lists log={log} tag="at-edge" items={INITIAL} />
          </EdgeRight>
        </Card>
      </div>
      <p class="note">
        <b>BUG (inherited).</b> Same root cause as <code>select-flyout</code>: positioning is{' '}
        <code>AnchoredPopover</code>'s, and it listens for <code>resize</code> only. Open the
        flyout inside the scroll box, scroll, and the panel is orphaned mid-air. Worse here than in
        a select, because this panel holds a rename input — you can be typing into a field whose
        anchor is no longer on screen.
      </p>

      <h2>3 · State &amp; dismiss</h2>
      <p class="note">
        <b>Always controlled</b>, like the primitive underneath: <code>open</code> is an accessor,{' '}
        <code>onDismiss</code> is a request. Exit paths: <b>Escape</b>, <b>outside pointerdown</b>,{' '}
        <b>activate a row</b> (my <code>onActivate</code> closes it — that is the caller's choice,
        not the component's), and <b>programmatic</b>. No scroll-away. One thing to watch in the
        log: a rename or delete emits <code>:start</code> then <code>:done</code>{' '}
        {HANDLER_LATENCY_MS}ms apart, and the panel stays open across both — an async handler must
        not be able to close the surface out from under itself.
      </p>
      <div class="row">
        <Card cap="rename a row and watch the start/done pair — the panel stays open">
          <Lists log={log} tag="dismiss" items={INITIAL} />
        </Card>
      </div>

      <h2>4 · Event log</h2>
      <div class="row">
        <EventLog
          log={log}
          hint="Rename/delete/create each log :start then :done. Scrolling with the panel open logs nothing — that silence is the inherited bug."
        />
      </div>
    </>
  );
}
