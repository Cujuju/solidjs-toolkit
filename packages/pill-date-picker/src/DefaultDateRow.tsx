import { Show, type JSX } from 'solid-js';
import type { PillDateEntry, PillDateRowContext } from './types';

  /** Built-in date, annotation and DTE content. Custom and default rendering share the same outer row, state attributes, click and cursor handling. */
export const DefaultRow = <T extends PillDateEntry>(p: { ctx: PillDateRowContext<T> }): JSX.Element => (
    <>
      <span class="cpdp-row-date">{p.ctx.label}</span>
      <Show when={p.ctx.annotation}>
        {(note) => <span class="cpdp-row-note">{note()}</span>}
      </Show>
      {/* The colour is a style, not a class: the ramp is caller-supplied, so the
                package cannot know a palette's class names. A disabled row drops the ramp. */}
      <span
        class="cpdp-row-dte"
        style={p.ctx.state === 'disabled' ? undefined : { color: p.ctx.dteColor }}
      >
        {p.ctx.dteLabel}
      </span>
    </>
  );

