/**
 * happy-dom has no Popover API; the suite stubs `matches(':popover-open')` and no-op
 * showPopover/hidePopover via `setOpen`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { Flyout, type FlyoutOption } from '../Flyout';

const originalMatches = HTMLElement.prototype.matches;

function installPopoverStubs(): { setOpen: (open: boolean) => void } {
  let popoverOpen = false;
  HTMLElement.prototype.matches = function (selectors: string): boolean {
    if (selectors === ':popover-open') return popoverOpen;
    return originalMatches.call(this, selectors);
  };
  (HTMLElement.prototype as HTMLElement & { showPopover: () => void }).showPopover = function () {
    popoverOpen = true;
  };
  (HTMLElement.prototype as HTMLElement & { hidePopover: () => void }).hidePopover = function () {
    popoverOpen = false;
  };
  return { setOpen: (open) => { popoverOpen = open; } };
}

function uninstallPopoverStubs(): void {
  HTMLElement.prototype.matches = originalMatches;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).showPopover;
  delete (HTMLElement.prototype as Partial<HTMLElement & { showPopover: unknown; hidePopover: unknown }>).hidePopover;
}

let dispose: (() => void) | null = null;

beforeEach(() => {
  installPopoverStubs();
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

afterEach(() => {
  dispose?.();
  dispose = null;
  uninstallPopoverStubs();
  document.body.innerHTML = '';
});

const FRUITS: FlyoutOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date', disabled: true },
  { value: 'elderberry', label: 'Elderberry' },
];

interface RenderArgs {
  options?: FlyoutOption[];
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

function renderSelect(args: RenderArgs = {}): {
  getValue: () => string;
  getTrigger: () => HTMLButtonElement;
  getOptions: () => HTMLButtonElement[];
} {
  const [value, setValue] = createSignal(args.initialValue ?? '');
  dispose = render(
    () => (
      <Flyout
        options={args.options ?? FRUITS}
        value={value()}
        onChange={(v) => {
          setValue(v);
          args.onChange?.(v);
        }}
        placeholder={args.placeholder}
        disabled={args.disabled}
        ariaLabel="Fruit picker"
      />
    ),
    document.body,
  );
  return {
    getValue: () => value(),
    getTrigger: () => document.querySelector<HTMLButtonElement>('[role="combobox"]')!,
    getOptions: () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')),
  };
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe('Flyout', () => {
  it('renders the selected option label as the trigger label', () => {
    const { getTrigger } = renderSelect({ initialValue: 'banana' });
    expect(getTrigger().textContent).toContain('Banana');
  });

  it('renders the placeholder when value matches no option', () => {
    const { getTrigger } = renderSelect({
      initialValue: 'nonexistent',
      placeholder: 'Pick one…',
    });
    expect(getTrigger().textContent).toContain('Pick one…');
  });

  it('clicking the trigger opens the panel and renders all options', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false');
    getTrigger().click();
    await nextFrame();
    expect(getTrigger().getAttribute('aria-expanded')).toBe('true');
    const opts = getOptions();
    expect(opts).toHaveLength(FRUITS.length);
    // Text is the label only; the selection marker is CSS, so copying or text queries never see it.
    expect(opts.map((o) => o.textContent?.trim())).toEqual([
      'Apple',
      'Banana',
      'Cherry',
      'Date',
      'Elderberry',
    ]);
    // Selection is carried by ARIA + the class, which is what actually
    // conveys it to assistive tech and to the stylesheet.
    expect(opts[0].getAttribute('aria-selected')).toBe('true');
    expect(opts[0].className).toContain('cujuju-select-flyout-option-selected');
    expect(opts[1].getAttribute('aria-selected')).toBe('false');
  });

  it('clicking an option fires onChange with that value and closes the panel', async () => {
    const onChange = vi.fn();
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple', onChange });
    getTrigger().click();
    await nextFrame();
    const banana = getOptions().find((o) => o.textContent?.includes('Banana'))!;
    banana.click();
    expect(onChange).toHaveBeenCalledWith('banana');
    // Panel closed — happy-dom doesn't enforce [popover]:not(:popover-open)
    // {display:none} so the option DOM persists; assert on aria-expanded
    // (the source of truth our reactive state drives) instead.
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('aria-expanded reflects open state', async () => {
    const { getTrigger } = renderSelect({ initialValue: 'apple' });
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false');
    getTrigger().click();
    await nextFrame();
    expect(getTrigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('ArrowDown moves focus to the next non-disabled option', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    getTrigger().click();
    await nextFrame();
    // After-paint focuses Apple (index 0). Press ArrowDown → Banana (1).
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(getOptions()[1]);
  });

  it('ArrowUp moves focus to the previous non-disabled option', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'banana' });
    getTrigger().click();
    await nextFrame();
    // After-paint focuses Banana (index 1). Press ArrowUp → Apple (0).
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(getOptions()[0]);
  });

  it('Arrow navigation skips disabled options', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'cherry' });
    getTrigger().click();
    await nextFrame();
    // After-paint focuses Cherry (index 2). ArrowDown should skip Date
    // (disabled, index 3) and land on Elderberry (index 4).
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(getOptions()[4]);
  });

  it('Enter on a focused option fires onChange', async () => {
    const onChange = vi.fn();
    const { getTrigger } = renderSelect({ initialValue: 'apple', onChange });
    getTrigger().click();
    await nextFrame();
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('Escape closes the panel and restores focus to the trigger', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    getTrigger().click();
    await nextFrame();
    expect(getOptions().length).toBeGreaterThan(0);
    expect(getTrigger().getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(getTrigger());
  });

  it('type-ahead: typing letters jumps focus to the first matching option', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    getTrigger().click();
    await nextFrame();
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(document.activeElement).toBe(getOptions()[2]); // Cherry
  });

  it('type-ahead is case-insensitive', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    getTrigger().click();
    await nextFrame();
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true }));
    expect(document.activeElement).toBe(getOptions()[1]); // Banana
  });

  it('disabled prop disables the trigger button (panel never opens)', () => {
    const onChange = vi.fn();
    const { getTrigger } = renderSelect({ initialValue: 'apple', disabled: true, onChange });
    expect(getTrigger().disabled).toBe(true);
    expect(getTrigger().getAttribute('aria-disabled')).toBe('true');
    getTrigger().click();
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Space key on closed trigger opens the panel', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    getTrigger().focus();
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false');
    getTrigger().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await nextFrame();
    expect(getOptions().length).toBeGreaterThan(0);
    expect(getTrigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('Home jumps focus to the first enabled option', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'elderberry' });
    getTrigger().click();
    await nextFrame();
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(getOptions()[0]); // Apple
  });

  it('End jumps focus to the last enabled option (skipping trailing disabled)', async () => {
    const { getTrigger, getOptions } = renderSelect({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C', disabled: true },
      ],
      initialValue: 'a',
    });
    getTrigger().click();
    await nextFrame();
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(getOptions()[1]); // B (last enabled)
  });

  it('selected option carries aria-selected="true"', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'banana' });
    getTrigger().click();
    await nextFrame();
    const banana = getOptions().find((o) => o.textContent?.includes('Banana'))!;
    expect(banana.getAttribute('aria-selected')).toBe('true');
    const apple = getOptions().find((o) => o.textContent?.includes('Apple'))!;
    expect(apple.getAttribute('aria-selected')).toBe('false');
  });

  it('clicking the trigger to close restores focus to the trigger', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    getTrigger().click();
    await nextFrame();
    expect(document.activeElement).toBe(getOptions()[0]);
    // happy-dom's click() does not focus the button — same as Safari / macOS Firefox.
    getTrigger().click();
    expect(getTrigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(getTrigger());
  });

  it('disabled flipping true while open closes the panel and blocks commit', async () => {
    const onChange = vi.fn();
    const [disabled, setDisabled] = createSignal(false);
    dispose = render(
      () => (
        <Flyout options={FRUITS} value="apple" onChange={onChange} disabled={disabled()} />
      ),
      document.body,
    );
    const trigger = document.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    trigger.click();
    await nextFrame();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    setDisabled(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('panel keyboard handling survives focus landing on panel chrome', async () => {
    const { getTrigger, getOptions } = renderSelect({ initialValue: 'apple' });
    getTrigger().click();
    await nextFrame();
    const panel = document.querySelector<HTMLElement>('.cujuju-select-flyout-panel')!;
    // A pointerdown on non-option chrome focuses the nearest focusable ancestor.
    expect(panel.getAttribute('tabindex')).toBe('-1');
    panel.focus();
    expect(document.activeElement).toBe(panel);
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(getOptions()[1]);
  });

  it('re-anchors focus when options are re-created while open', async () => {
    const [options, setOptions] = createSignal(FRUITS);
    dispose = render(
      () => <Flyout options={options()} value="banana" onChange={() => {}} />,
      document.body,
    );
    const trigger = document.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    const getOptions = (): HTMLButtonElement[] =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    trigger.click();
    await nextFrame();
    expect(document.activeElement).toBe(getOptions()[1]);
    setOptions(FRUITS.map((o) => ({ ...o })));
    await nextFrame();
    expect(document.activeElement).toBe(getOptions()[1]);
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(getOptions()[2]);
  });

  it('shrinking options while open keeps DOM focus on the highlighted row', async () => {
    const LETTERS: FlyoutOption[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
      { value: 'd', label: 'D' },
    ];
    const [options, setOptions] = createSignal(LETTERS);
    const [value, setValue] = createSignal('d');
    dispose = render(
      () => <Flyout options={options()} value={value()} onChange={setValue} />,
      document.body,
    );
    const trigger = document.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    const getOptions = (): HTMLButtonElement[] =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    trigger.click();
    await nextFrame();
    expect(document.activeElement).toBe(getOptions()[3]); // D
    // An external value change re-runs the label effect, which reorders Solid's observers.
    setValue('c');
    // D's row object survives, so <For> keeps its (focused) DOM node while the
    // stale focusedIndex 3 is clamped to 0.
    setOptions([LETTERS[2]!, LETTERS[3]!]);
    await nextFrame();
    const rows = getOptions();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.className).toContain('cujuju-select-flyout-option-focused');
    expect(rows[0]!.getAttribute('tabindex')).toBe('0');
    // Highlight and DOM focus must agree, or Enter commits a row the AT never announced.
    expect(document.activeElement).toBe(rows[0]);
  });
});
