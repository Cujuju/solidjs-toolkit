import { Show, type JSX } from 'solid-js';
import { formatValue } from './_internal/precision';
import { toCssSize } from './_internal/cssSize';
import type { PillNumberPickerProps, PnpSegmentApi, PnpSegment } from './types';
import type { createPickerSession } from './createPickerSession';
import type { createPickerInteraction } from './createPickerInteraction';

export function createPickerElements(
  props: PillNumberPickerProps,
  s: ReturnType<typeof createPickerSession>,
  i: ReturnType<typeof createPickerInteraction>,
) {
  // ── Element builders ─────────────────────────────────────────────────
  const incButton = (): JSX.Element => (
    <button
      type="button"
      data-pos="inc"
      class="cpnp-btn"
      style={{
        width: toCssSize(props.buttonWidth),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
      }}
      disabled={props.disabled || s.current() >= s.max()}
      aria-label={props.incrementLabel ?? 'Increase'}
      onClick={i.onStepperClick(1)}
      onPointerDown={() => i.startRepeat(1)}
      onPointerUp={i.stopRepeat}
      onPointerLeave={i.stopRepeat}
      onPointerCancel={i.stopRepeat}
    >
      {props.incrementIcon ?? '+'}
    </button>
  );

  const decButton = (): JSX.Element => (
    <button
      type="button"
      data-pos="dec"
      class="cpnp-btn"
      style={{
        width: toCssSize(props.buttonWidth),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
      }}
      disabled={props.disabled || s.current() <= s.min()}
      aria-label={props.decrementLabel ?? 'Decrease'}
      onClick={i.onStepperClick(-1)}
      onPointerDown={() => i.startRepeat(-1)}
      onPointerUp={i.stopRepeat}
      onPointerLeave={i.stopRepeat}
      onPointerCancel={i.stopRepeat}
    >
      {props.decrementIcon ?? '−'}
    </button>
  );

  /** The reset target, clamped/rounded like any other publish, so `resetTo`
   *  outside [min,max] (or off-grid for the precision) still lands legal. */
  const resetTarget = (): number => s.clamp(props.resetTo ?? 0);

  /**
   * The channel a segment's `onSelect` gets, built fresh per click so `value` is an honest
   * snapshot. `setValue` goes through the SAME paths a step does.
   */
  const segmentApi = (): PnpSegmentApi => ({
    value: s.current(),
    setValue: (v: number): void => {
      const next = s.resolveSet(v);
      if (next !== s.current()) s.emit(next);
    },
    commit: (): void => {
      if (s.sessionOpen()) s.commitSession();
    },
    cancel: (): void => {
      if (s.sessionOpen()) s.cancelSession();
    },
  });

  /** ONE render path for every segment — built-in reset and consumer-declared
   *  alike — so flush borders, sizing, disabled treatment and the publish
   *  channel can never diverge between them. */
  const segmentButton = (seg: PnpSegment): JSX.Element => (
    <button
      type="button"
      data-pos={`seg-${seg.key}`}
      class="cpnp-btn"
      style={{
        width: toCssSize(seg.width ?? props.buttonWidth),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
      }}
      disabled={props.disabled || (seg.disabled?.(s.current()) ?? false)}
      aria-label={seg.label}
      onClick={() => {
        if (props.disabled) return;
        seg.onSelect(segmentApi());
      }}
    >
      {seg.icon}
    </button>
  );

  /** `resetTo` is sugar over the segment contract — proof the generic API
   *  subsumes the built-in, and the reason there is only one render path. */
  const resetSegment = (): PnpSegment => ({
    key: 'reset',
    icon: props.resetIcon ?? '↺',
    label: props.resetLabel ?? 'Reset',
    disabled: (v) => v === resetTarget(),
    onSelect: (api) => api.setValue(resetTarget()),
  });

  const valueText = (): string =>
    s.current() === 0 && props.zeroLabel
      ? props.zeroLabel
      : (props.displayValue ? props.displayValue(s.current()) : formatValue(s.current(), s.precision()));

  /**
   * The value cell. `where` matters because a collapsed picker's cell is a DIFFERENT control
   * from the one inside the pop-out: it opens the editor rather than being it.
   */
  const valueNode = (where: 'panel' | 'collapsed'): JSX.Element => {
    const collapsedCell = where === 'collapsed';
    const commonStyle = (): JSX.CSSProperties => ({
      // Collapsed, the cell hugs its digits: `valueWidth()` becomes a FLOOR, so a value that
            // outgrows it widens the pill instead of being clipped.
      width: collapsedCell ? 'max-content' : s.valueWidth(),
      'min-width': collapsedCell ? s.valueWidth() : undefined,
      height: toCssSize(props.height),
      'font-size': toCssSize(props.fontSize),
    });
    return (
      <Show
        when={s.editing() && s.editable() && !collapsedCell}
        fallback={
          <span
            data-pos="value"
            class="cpnp-value"
            role="spinbutton"
            tabIndex={props.disabled ? -1 : 0}
            aria-valuenow={s.current()}
            aria-valuemin={s.min()}
            aria-valuemax={s.max()}
            aria-label={props.ariaLabel}
            aria-expanded={s.collapsible() && collapsedCell ? false : undefined}
            style={{
              ...commonStyle(),
              cursor: collapsedCell ? 'pointer' : s.editable() ? 'text' : 'default',
            }}
            onClick={() => {
              if (props.disabled) return;
              if (collapsedCell) { s.openEditor(); return; }
              if (s.editable()) s.beginEditing();
            }}
            onKeyDown={(e) => {
              // Enter / Space open the editor from the keyboard — without this the
              // pop-out is mouse-only for a collapsed picker.
              if (collapsedCell && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                s.openEditor();
                return;
              }
              // The click path's keyboard twin: enter typing mode (F2 is the spreadsheet convention).
              if (!collapsedCell && s.editable() && (e.key === 'Enter' || e.key === ' ' || e.key === 'F2')) {
                e.preventDefault();
                s.beginEditing();
                return;
              }
              i.onKeyDown(e);
            }}
          >
            {valueText()}
          </span>
        }
      >
        <input
          ref={s.inputEl}
          data-pos="value"
          class="cpnp-input"
          type="text"
          aria-label={props.ariaLabel}
          inputMode="numeric"
          value={s.draft()}
          style={commonStyle()}
          onInput={(e) => s.setDraft(e.currentTarget.value)}
          onBlur={(e) => {
            // Focus moving to a +/- button in the SAME pop-out is not the end of the edit: take the
                        // typed text, but leave the editor open.
            const next = e.relatedTarget as Node | null;
            const stayingInPanel = !!next && !!s.panelEl && s.panelEl.contains(next);
            // Chromium blurs a focused input as it is removed. Once a close has decided the session
            // (collapsed shut, or a close in flight), typed text must not publish.
            if (s.isCollapsed() || (s.collapsible() && s.closeDecided)) return;
            i.commitDraft(!stayingInPanel);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Take the text, then END the session: close and confirm. This is the
              // primary confirmation gesture.
              i.commitDraft();
              if (s.sessionOpen()) s.commitSession();
            } else if (e.key === 'Escape') {
              if (s.sessionOpen()) {
                s.cancelSession();
              } else {
                s.setEditing(false);
                s.setDraft(formatValue(s.current(), s.precision()));
              }
            } else {
              i.onKeyDown(e);
            }
          }}
        />
      </Show>
    );
  };

  /**
   * The anchor while the editor is open. It holds the row's LAYOUT and is the CLOSE gesture,
   * but is `aria-hidden`: the same spinbutton offered twice is indistinguishable.
   */
  const anchorPlaceholder = (): JSX.Element => (
    <span
      class="cpnp-value"
      aria-hidden="true"
      data-placeholder="true"
      title="Confirm"
      style={{
        width: 'max-content',
        'min-width': s.valueWidth(),
        height: toCssSize(props.height),
        'font-size': toCssSize(props.fontSize),
        cursor: 'pointer',
      }}
      onClick={() => {
        if (props.disabled) return;
        s.commitSession();
      }}
    >
      {valueText()}
    </span>
  );

  // ── Layout assembly ──────────────────────────────────────────────────
  const items = (): JSX.Element[] => {
    const segs = props.segments ?? [];
    const parts = s.layout().replace(/^v-/, '').split('-') as Array<'value' | 'inc' | 'dec'>;
    // Row order: [start segments][layout parts][end segments][reset]. Every member picks up
        // the positional flush-border and outer-corner rules.
    const out: JSX.Element[] = segs
      .filter((s) => s.position === 'start')
      .map(segmentButton);
    for (const p of parts) {
      if (p === 'value') out.push(valueNode('panel'));
      else if (p === 'inc') out.push(incButton());
      else out.push(decButton());
    }
    out.push(...segs.filter((s) => (s.position ?? 'end') === 'end').map(segmentButton));
    // Reset stays OUTERMOST-last — after every consumer 'end' segment — so its
    // 0.4.0 position (the row's final segment) holds whatever a consumer adds.
    if (props.resetTo !== undefined) out.push(segmentButton(resetSegment()));
    return out;
  };

  const rangeText = (): string => {
    const fmt = props.rangeFormat ?? ((v: number, _min: number, mx: number) => `${v} / ${mx}`);
    // `current()`, not `props.value`: inside a 'finish' session the prop is deliberately
    // stale, and a range rendered beside the stepped number must not disagree with it.
    return fmt(s.current(), s.min(), s.max());
  };

  const suffixNode = (): JSX.Element => (
    <>
      <Show when={props.suffix && !(s.current() === 0 && props.zeroLabel)}>
        <span class="cpnp-suffix">{props.suffix}</span>
      </Show>
      <Show when={props.showRange}>
        <span class="cpnp-range">{rangeText()}</span>
      </Show>
    </>
  );

  return { items, valueNode, anchorPlaceholder, suffixNode };
}
