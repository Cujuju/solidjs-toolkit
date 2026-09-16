/**
 * One keyboard-owner stack across packages.
 *
 * pill-date-picker and pill-number-picker each bind Escape to the DOCUMENT. With a stack per
 * module, each saw itself on top of its OWN stack, so one Escape closed both pop-outs.
 * Neither package may depend on the other, so the stack lives on `globalThis`.
 *
 * The number picker is imported by relative source path: it is not a dependency.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import { PillDatePicker } from '../PillDatePicker';
import { PillNumberPicker } from '../../../pill-number-picker/src/PillNumberPicker';

let dispose: (() => void) | null = null;
function mount(ui: () => any): void {
  const host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
}
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

const NOW = new Date(2026, 5, 13);
const LADDER = ['2026-06-19', '2026-06-26', '2026-07-02'];
const escape = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('a date picker and a number picker open together', () => {
  it('Escape closes only the date picker when it opened last', () => {
    const dateOpenChange = vi.fn();
    const numberCancel = vi.fn();
    mount(() => (
      <>
        <PillNumberPicker collapsible open value={5} onChange={() => {}} onCancel={numberCancel} min={1} max={100} />
        <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} open onOpenChange={dateOpenChange} />
      </>
    ));
    escape();
    expect(dateOpenChange).toHaveBeenCalledWith(false);
    expect(numberCancel, 'the number picker underneath cancelled too').not.toHaveBeenCalled();
  });

  it('Escape cancels only the number picker when it opened last', () => {
    const dateOpenChange = vi.fn();
    const numberCancel = vi.fn();
    mount(() => (
      <>
        <PillDatePicker items={LADDER} value={null} onChange={() => {}} now={NOW} open onOpenChange={dateOpenChange} />
        <PillNumberPicker collapsible open value={5} onChange={() => {}} onCancel={numberCancel} min={1} max={100} />
      </>
    ));
    escape();
    expect(numberCancel).toHaveBeenCalledTimes(1);
    expect(dateOpenChange, 'the date picker underneath closed too').not.toHaveBeenCalledWith(false);
  });
});
