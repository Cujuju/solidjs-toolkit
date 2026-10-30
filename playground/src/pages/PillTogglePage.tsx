import { createSignal, type JSX } from 'solid-js';
import { PillToggle } from '@cujuju/solidjs-pill-toggle';
import { Code, Card } from '../ui';

export function PillTogglePage(): JSX.Element {
  const [a, setA] = createSignal(true);
  const [b, setB] = createSignal(false);
  const [c, setC] = createSignal(false);
  const [d, setD] = createSignal(true);
  const [e, setE] = createSignal(false);

  return (
    <>
      <h1>@cujuju/solidjs-pill-toggle</h1>
      <p class="note">
        A switch. Four sizes, an indeterminate state (a group where only some children are on),
        a loading state, and colour overrides per instance.
      </p>
      <Code cap="usage">{`
import { PillToggle } from '@cujuju/solidjs-pill-toggle';
import '@cujuju/solidjs-pill-toggle/styles.css';

const [on, setOn] = createSignal(false);

<PillToggle enabled={on()} onToggle={() => setOn((v) => !v)} ariaLabel="Live" />

// Other states:
<PillToggle enabled={false} indeterminate onToggle={…} ariaLabel="mixed" />
<PillToggle enabled onToggle={…} disabled  ariaLabel="disabled" />
<PillToggle enabled onToggle={…} readOnly  ariaLabel="read-only" />
<PillToggle enabled onToggle={…} loading   ariaLabel="loading" />
`}</Code>

      <h2>Sizes</h2>
      <div class="row">
        <Card cap="xs / sm / md / lg">
          <PillToggle enabled={a()} onToggle={() => setA((v) => !v)} size="xs" ariaLabel="xs" />
          <PillToggle enabled={a()} onToggle={() => setA((v) => !v)} size="sm" ariaLabel="sm" />
          <PillToggle enabled={a()} onToggle={() => setA((v) => !v)} size="md" ariaLabel="md" />
          <PillToggle enabled={a()} onToggle={() => setA((v) => !v)} size="lg" ariaLabel="lg" />
        </Card>
      </div>

      <h2>States</h2>
      <div class="row">
        <Card cap="off / on / indeterminate">
          <PillToggle enabled={false} onToggle={() => {}} ariaLabel="off" />
          <PillToggle enabled onToggle={() => {}} ariaLabel="on" />
          <PillToggle enabled={false} indeterminate onToggle={() => {}} ariaLabel="mixed" />
        </Card>
        <Card cap="disabled / read-only / loading">
          <PillToggle enabled onToggle={() => {}} disabled ariaLabel="disabled" />
          <PillToggle enabled onToggle={() => {}} readOnly ariaLabel="read-only" />
          <PillToggle enabled={b()} onToggle={() => setB((v) => !v)} loading ariaLabel="loading" />
        </Card>
        <Card cap="colour override + bounce">
          <PillToggle
            enabled={c()}
            onToggle={() => setC((v) => !v)}
            onColor="var(--green)"
            offColor="var(--surface-2)"
            animation="bounce"
            pressEffect="scale"
            ariaLabel="Armed"
          />
          <span class="readout">armed <b>{String(c())}</b></span>
        </Card>
      </div>

      <h2>Geometry, icons, motion</h2>
      <Code cap="more props">{`
<PillToggle enabled={on()} onToggle={flip} ariaLabel="Night mode"
  width={56} height={28} dotSize={22} dotColor="#fde68a"
  onIcon={<span>☾</span>} offIcon={<span>☀</span>}
  transitionMs={400} easing="cubic-bezier(.2,.9,.3,1.2)" title="Night mode" />

// A visible label instead of ariaLabel, plus root style and data attributes:
<span id="wifi-label">Wi-Fi</span>
<PillToggle enabled={on()} onToggle={flip} ariaLabelledBy="wifi-label"
  style={{ 'margin-left': '8px' }} dataAttr={{ 'data-testid': 'wifi' }} />
`}</Code>
      <div class="row">
        <Card cap="width · height · dotSize · dotColor · onIcon/offIcon · transitionMs · easing · title">
          <PillToggle
            enabled={d()}
            onToggle={() => setD((v) => !v)}
            ariaLabel="Night mode"
            width={56}
            height={28}
            dotSize={22}
            dotColor="#fde68a"
            onIcon={<span style={{ 'font-size': '12px', color: '#1e293b' }}>☾</span>}
            offIcon={<span style={{ 'font-size': '12px', color: '#1e293b' }}>☀</span>}
            transitionMs={400}
            easing="cubic-bezier(.2,.9,.3,1.2)"
            title="Night mode"
          />
        </Card>
        <Card cap="ariaLabelledBy · style · dataAttr">
          <span id="pt-wifi-label">Wi-Fi</span>
          <PillToggle
            enabled={e()}
            onToggle={() => setE((v) => !v)}
            ariaLabelledBy="pt-wifi-label"
            style={{ 'margin-left': '8px' }}
            dataAttr={{ 'data-testid': 'wifi' }}
          />
        </Card>
      </div>
    </>
  );
}
