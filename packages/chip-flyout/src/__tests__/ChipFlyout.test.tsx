import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@solidjs/testing-library';
import { ChipFlyout } from '../ChipFlyout';
import { EMPTY_TRI_STATE } from '@cujuju/solidjs-tri-state-chip';

// Dispose each render between tests, then hard-clear the body.
// ChipFlyout's panel is Portal'd to `document.body`; without a full
// clear a leftover panel contaminates the global `document.querySelector`
// lookups the helpers below rely on.
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

/** The trigger button — the first (and only) child rendered inline. */
function trigger(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>('.cujuju-cf-trigger');
  if (!el) throw new Error('expected a trigger button');
  return el;
}

/** Portal'd panel lives on document.body, outside the render container. */
function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function chips(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.ctc-chip')];
}

describe('ChipFlyout — trigger + open/close', () => {
  it('renders the trigger label', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} />
    ));
    expect(trigger(container).textContent).toContain('Tags');
  });

  it('is closed initially — no panel in the document', () => {
    render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} />
    ));
    expect(panel()).toBeNull();
  });

  it('opens the panel on trigger click', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(panel()).not.toBeNull();
    expect(chips()).toHaveLength(2);
  });

  it('does not open when disabled', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} disabled onChange={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(panel()).toBeNull();
  });

  it('closes the open panel on Escape', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(panel()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel()).toBeNull();
  });
});

describe('ChipFlyout — multi mode', () => {
  it('toggles a value into the array on chip click', () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={onChange} />
    ));
    fireEvent.click(trigger(container));
    fireEvent.click(chips()[0]);
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('removes a selected value on second chip click', () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={['a']} onChange={onChange} />
    ));
    fireEvent.click(trigger(container));
    fireEvent.click(chips()[0]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows an included count badge on the trigger', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={['a', 'b']} onChange={() => {}} />
    ));
    expect(trigger(container).querySelector('.cujuju-cf-badge--included')?.textContent).toBe('+2');
  });
});

describe('ChipFlyout — tri-state mode', () => {
  it('cycles an option unselected -> included on first chip click', () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout
        mode="tri-state"
        label="Status"
        options={OPTIONS}
        value={{ ...EMPTY_TRI_STATE }}
        onChange={onChange}
      />
    ));
    fireEvent.click(trigger(container));
    fireEvent.click(chips()[0]);
    expect(onChange).toHaveBeenCalledWith({ included: ['a'], excluded: [] });
  });

  it('renders +N / -N badges from the tri-state value', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="tri-state"
        label="Status"
        options={OPTIONS}
        value={{ included: ['a'], excluded: ['b'] }}
        onChange={() => {}}
      />
    ));
    expect(trigger(container).querySelector('.cujuju-cf-badge--included')?.textContent).toBe('+1');
    expect(trigger(container).querySelector('.cujuju-cf-badge--excluded')?.textContent).toBe('−1');
  });

  it('shows a Clear action that resets the value', () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout
        mode="tri-state"
        label="Status"
        options={OPTIONS}
        value={{ included: ['a'], excluded: [] }}
        onChange={onChange}
      />
    ));
    fireEvent.click(trigger(container));
    const clear = document.querySelector<HTMLButtonElement>('.cujuju-cf-clear');
    expect(clear).not.toBeNull();
    fireEvent.click(clear!);
    expect(onChange).toHaveBeenCalledWith({ included: [], excluded: [] });
  });

  it('omits the Clear action when the value is empty', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="tri-state"
        label="Status"
        options={OPTIONS}
        value={{ ...EMPTY_TRI_STATE }}
        onChange={() => {}}
      />
    ));
    fireEvent.click(trigger(container));
    expect(document.querySelector('.cujuju-cf-clear')).toBeNull();
  });
});

describe('ChipFlyout — grouping & typeahead', () => {
  it('renders a group header when options carry a group', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={[
          { value: 'a', label: 'Alpha', group: 'letters' },
          { value: '1', label: 'One', group: 'numbers' },
        ]}
        value={[]}
        onChange={() => {}}
      />
    ));
    fireEvent.click(trigger(container));
    const headers = [...document.querySelectorAll('.cujuju-cf-group-header')];
    expect(headers.map((h) => h.textContent)).toEqual(['Letters', 'Numbers']);
  });

  it('renders a search input when onSearchInput is wired', () => {
    const onSearchInput = vi.fn();
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        onSearchInput={onSearchInput}
      />
    ));
    fireEvent.click(trigger(container));
    const search = document.querySelector<HTMLInputElement>('.cujuju-cf-search');
    expect(search).not.toBeNull();
    fireEvent.input(search!, { target: { value: 'al' } });
    expect(onSearchInput).toHaveBeenCalledWith('al');
  });
});

describe('ChipFlyout — tab strip', () => {
  const TABS = [
    { id: 'mangadex', label: 'MangaDex' },
    { id: 'local', label: 'Local' },
  ];

  function tabButtons(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>('.cujuju-cf-tab')];
  }

  it('renders no tab strip when `tabs` is absent', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(tabButtons()).toHaveLength(0);
  });

  it('renders no tab strip when `tabs` is empty', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={[]}
      />
    ));
    fireEvent.click(trigger(container));
    expect(document.querySelector('[role="tablist"]')).toBeNull();
  });

  it('renders one tab per entry and marks the active one', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={TABS}
        activeTab="local"
        onTabChange={() => {}}
      />
    ));
    fireEvent.click(trigger(container));
    const tabs = tabButtons();
    expect(tabs.map((t) => t.textContent)).toEqual(['MangaDex', 'Local']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    // Roving tabindex: exactly one tab stop, on the active tab.
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0']);
  });

  it('falls back to the first tab when `activeTab` is unset', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={TABS}
      />
    ));
    fireEvent.click(trigger(container));
    expect(tabButtons()[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('fires onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={TABS}
        activeTab="mangadex"
        onTabChange={onTabChange}
      />
    ));
    fireEvent.click(trigger(container));
    fireEvent.click(tabButtons()[1]!);
    expect(onTabChange).toHaveBeenCalledWith('local');
  });

  it('moves between tabs with arrow keys, wrapping at the ends', () => {
    const onTabChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={TABS}
        activeTab="mangadex"
        onTabChange={onTabChange}
      />
    ));
    fireEvent.click(trigger(container));
    fireEvent.keyDown(tabButtons()[0]!, { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenLastCalledWith('local');
    fireEvent.keyDown(tabButtons()[0]!, { key: 'ArrowLeft' });
    expect(onTabChange).toHaveBeenLastCalledWith('local');
    fireEvent.keyDown(tabButtons()[1]!, { key: 'End' });
    expect(onTabChange).toHaveBeenLastCalledWith('local');
    fireEvent.keyDown(tabButtons()[1]!, { key: 'Home' });
    expect(onTabChange).toHaveBeenLastCalledWith('mangadex');
  });

  it('renders the tab strip above the search input', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        onSearchInput={() => {}}
        tabs={TABS}
      />
    ));
    fireEvent.click(trigger(container));
    const body = document.querySelector('.cujuju-cf-body')!;
    const strip = body.querySelector('[role="tablist"]')!;
    const search = body.querySelector('.cujuju-cf-search')!;
    expect(strip.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});
