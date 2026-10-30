import { createSignal, onMount, type JSX } from 'solid-js';
import { Collapsible } from '@cujuju/solidjs-collapsible';
import { Code, Card } from '../ui';

function Filler(props: { n: number }): JSX.Element {
  return (
    <div class="readout" style={{ padding: '6px 4px' }}>
      {Array.from({ length: props.n }, (_, i) => (
        <div>row {i + 1}</div>
      ))}
    </div>
  );
}

/** Counts its own mounts, so lazyMount / keepMounted are visible. */
function MountCounter(props: { onMount: () => void }): JSX.Element {
  onMount(props.onMount);
  return <Filler n={2} />;
}

export function CollapsiblePage(): JSX.Element {
  const [forced, setForced] = createSignal<boolean | null>(null);
  const [changes, setChanges] = createSignal<boolean[]>([]);
  const [lazyMounts, setLazyMounts] = createSignal(0);
  const [unmountMounts, setUnmountMounts] = createSignal(0);

  return (
    <>
      <h1>@cujuju/solidjs-collapsible</h1>
      <p class="note">
        A disclosure section that remembers its own state (<code>storageKey</code>) and can be
        driven from outside (<code>forceOpen</code> — an "expand all" button, say). The
        <code> useCollapsible</code> hook is exported separately for consumers that want the
        state machine without this chrome.
      </p>
      <Code cap="usage">{`
import { Collapsible } from '@cujuju/solidjs-collapsible';

<Collapsible title="Positions" count={4} defaultOpen>
  <MyRows />
</Collapsible>

// 'panel' variant + remembered open/closed state across reloads:
<Collapsible
  title="Greeks"
  variant="panel"
  storageKey="app:collapsible:greeks"
  defaultOpen
>
  <MyRows />
</Collapsible>
`}</Code>

      <h2>Variants</h2>
      <div class="row">
        <Card cap="section — the default">
          <div style={{ width: '260px' }}>
            <Collapsible title="Positions" count={4} defaultOpen>
              <Filler n={4} />
            </Collapsible>
            <Collapsible title="Orders" count={0}>
              <Filler n={2} />
            </Collapsible>
          </div>
        </Card>
        <Card cap="panel variant + persisted (reload the page)">
          <div style={{ width: '260px' }}>
            <Collapsible
              title="Greeks"
              variant="panel"
              storageKey="playground:collapsible:greeks"
              defaultOpen
            >
              <Filler n={3} />
            </Collapsible>
          </div>
        </Card>
      </div>

      <h2>Driven from outside</h2>
      <div class="row">
        <Card cap="forceOpen — null hands control back to the section">
          <div style={{ width: '260px' }}>
            <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px' }}>
              <button class="demo-btn" onClick={() => setForced(true)}>expand all</button>
              <button class="demo-btn" onClick={() => setForced(false)}>collapse all</button>
              <button class="demo-btn" onClick={() => setForced(null)}>release</button>
            </div>
            <Collapsible title="Alpha" forceOpen={forced()}>
              <Filler n={2} />
            </Collapsible>
            <Collapsible title="Beta" forceOpen={forced()}>
              <Filler n={2} />
            </Collapsible>
            <span class="readout">forceOpen <b>{String(forced())}</b></span>
          </div>
        </Card>
        <Card cap="onChange · storageKeyPrefix (key = prefix + storageKey)">
          <div style={{ width: '260px' }}>
            <Collapsible
              title="Watched"
              storageKeyPrefix="playground:collapsible:"
              storageKey="watched"
              onChange={(open) => setChanges((list) => [...list, open].slice(-6))}
            >
              <Filler n={2} />
            </Collapsible>
            <span class="readout">onChange <b>{changes().map(String).join(', ') || '—'}</b></span>
          </div>
        </Card>
      </div>

      <h2>Header slots</h2>
      <Code cap="slots and classes">{`
<Collapsible title="Alerts" uppercase id="alerts" ariaLabel="Alerts section"
  icon={<span>⚑</span>} openIcon={<span>−</span>} closedIcon={<span>+</span>}
  actions={<button onClick={clearAll}>Clear</button>}
  headerClass="my-header" contentClass="my-content">
  …
</Collapsible>
`}</Code>
      <div class="row">
        <Card cap="icon · openIcon/closedIcon · actions · uppercase · id · ariaLabel · headerClass/contentClass">
          <div style={{ width: '280px' }}>
            <Collapsible
              title="Alerts"
              uppercase
              id="pg-alerts"
              ariaLabel="Alerts section"
              icon={<span>⚑</span>}
              openIcon={<span>−</span>}
              closedIcon={<span>+</span>}
              actions={<button class="demo-btn" onClick={() => setChanges([])}>Clear log</button>}
              headerClass="demo-tinted"
              contentClass="demo-outlined"
              defaultOpen
            >
              <Filler n={2} />
            </Collapsible>
          </div>
        </Card>
      </div>

      <h2>Mounting and motion</h2>
      <div class="row">
        <Card cap="animated — height transitions on toggle">
          <div style={{ width: '260px' }}>
            <Collapsible title="Animated" animated defaultOpen>
              <Filler n={4} />
            </Collapsible>
          </div>
        </Card>
        <Card cap="lazyMount — children mount on first open, then stay">
          <div style={{ width: '260px' }}>
            <Collapsible title="Lazy" lazyMount>
              <MountCounter onMount={() => setLazyMounts((n) => n + 1)} />
            </Collapsible>
            <span class="readout">mounts <b>{lazyMounts()}</b></span>
          </div>
        </Card>
        <Card cap="keepMounted={false} — unmounts on every close">
          <div style={{ width: '260px' }}>
            <Collapsible title="Unmounting" keepMounted={false}>
              <MountCounter onMount={() => setUnmountMounts((n) => n + 1)} />
            </Collapsible>
            <span class="readout">mounts <b>{unmountMounts()}</b></span>
          </div>
        </Card>
      </div>
    </>
  );
}
