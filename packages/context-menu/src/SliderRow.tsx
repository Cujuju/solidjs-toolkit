import { createUniqueId } from 'solid-js';
import type { ContextMenuSlider } from './types';

/** A labelled range-slider row. Focuses the input on hover so the
 *  arrow keys adjust it without a click. */
export function SliderRow(props: { item: ContextMenuSlider }) {
  let inputRef: HTMLInputElement | undefined;
  const labelId = createUniqueId();
  return (
    <div
      class="cujuju-context-menu-slider-row"
      onMouseEnter={() => inputRef?.focus()}
      onMouseLeave={() => inputRef?.blur()}
    >
      <div class="cujuju-context-menu-slider-header">
        <span id={labelId} class="cujuju-context-menu-slider-label">{props.item.label}</span>
        <span class="cujuju-context-menu-slider-value">
          {props.item.value()}{props.item.unit ?? ''}
        </span>
      </div>
      <input
        ref={inputRef}
        type="range"
        aria-labelledby={labelId}
        min={props.item.min}
        max={props.item.max}
        step={props.item.step ?? 1}
        value={props.item.value()}
        onInput={(e) => props.item.onChange(e.currentTarget.valueAsNumber)}
        class="cujuju-context-menu-slider"
      />
    </div>
  );
}

