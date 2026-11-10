import { afterEach, describe, expect, it } from 'vitest';
import { createSignal, type JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { PillNumberPicker } from '../PillNumberPicker.js';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.innerHTML = ''; });

function mount(view: () => JSX.Element) {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(view, host);
  return host;
}

describe('consumer-resolved movement', () => {
  it('uses the resolver for buttons, arrow/page keys and wheel', () => {
    const [value, setValue] = createSignal(3);
    const host = mount(() => <PillNumberPicker value={value()} onChange={setValue} min={0} max={100}
      preserveInputPrecision resolveMove={(current, dir) => current + dir * 2} />);
    (host.querySelector('[data-pos="inc"]') as HTMLButtonElement).click();
    expect(value()).toBe(5);
    const cell = host.querySelector('[role="spinbutton"]')!;
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(value()).toBe(3);
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    expect(value()).toBe(23);
    host.querySelector('.cpnp-root')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true }));
    expect(value()).toBe(21);
  });

  it('disables movement but preserves typed decimals when no move is available', () => {
    const [value, setValue] = createSignal(2.37);
    const host = mount(() => <PillNumberPicker value={value()} onChange={setValue} min={0} max={100}
      precision={2} preserveInputPrecision resolveMove={() => null} />);
    expect((host.querySelector('[data-pos="inc"]') as HTMLButtonElement).disabled).toBe(true);
    expect((host.querySelector('[data-pos="dec"]') as HTMLButtonElement).disabled).toBe(true);
    const cell = host.querySelector('[role="spinbutton"]') as HTMLElement;
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(value()).toBe(2.37);
    cell.click();
    const input = host.querySelector('input')!;
    input.value = '2.37005';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(value()).toBe(2.37005);
    expect(host.querySelector('[role="spinbutton"]')?.textContent).toBe('2.37005');
  });

  it.each([NaN, Infinity, -1, 1000])('refuses an invalid resolved move %s', candidate => {
    const [value, setValue] = createSignal(2);
    const host = mount(() => <PillNumberPicker value={value()} onChange={setValue} min={0} max={100}
      resolveMove={() => candidate} />);
    (host.querySelector('[data-pos="inc"]') as HTMLButtonElement).click();
    expect(value()).toBe(2);
  });
});
