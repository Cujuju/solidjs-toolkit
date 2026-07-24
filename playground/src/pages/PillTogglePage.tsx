import { createSignal, type JSX } from 'solid-js';
import { PillToggle } from '@cujuju/solidjs-pill-toggle';
import { Card } from '../ui';

export function PillTogglePage(): JSX.Element {
  const [a, setA] = createSignal(true);
  const [b, setB] = createSignal(false);
  const [c, setC] = createSignal(false);

  return (
    <>
      <h1>@cujuju/solidjs-pill-toggle</h1>
      <p class="note">
        A switch. Four sizes, an indeterminate state (a group where only some children are on),
        a loading state, and colour overrides per instance.
      </p>

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
    </>
  );
}
