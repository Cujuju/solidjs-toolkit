import { createSignal, type JSX } from 'solid-js';
import { Collapsible } from '@cujuju/solidjs-collapsible';
import { Card } from '../ui';

function Filler(props: { n: number }): JSX.Element {
  return (
    <div class="readout" style={{ padding: '6px 4px' }}>
      {Array.from({ length: props.n }, (_, i) => (
        <div>row {i + 1}</div>
      ))}
    </div>
  );
}

export function CollapsiblePage(): JSX.Element {
  const [forced, setForced] = createSignal<boolean | null>(null);

  return (
    <>
      <h1>@cujuju/solidjs-collapsible</h1>
      <p class="note">
        A disclosure section that remembers its own state (<code>storageKey</code>) and can be
        driven from outside (<code>forceOpen</code> — an "expand all" button, say). The
        <code> useCollapsible</code> hook is exported separately for consumers that want the
        state machine without this chrome.
      </p>

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
      </div>
    </>
  );
}
