import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { ChipFlyout, VIEWPORT_MARGIN_PX, type ChipOption } from '../ChipFlyout';
import { EMPTY_TRI_STATE, type TriStateValue } from '@cujuju/solidjs-tri-state-chip';

// Dispose each render between tests, then hard-clear the body.
// ChipFlyout's panel is Portal'd to `document.body`; without a full
// clear a leftover panel contaminates the global `document.querySelector`
// lookups the helpers below rely on.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  /** Three entries so a wrap-around and a Home/End jump land somewhere
   *  DIFFERENT from the neighbour step — with two tabs every movement
   *  assertion is satisfied by the same element and can never fail. */
  const THREE_TABS = [
    { id: 'mangadex', label: 'MangaDex' },
    { id: 'nhentai', label: 'nhentai' },
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

  it('arrow keys move FOCUS only, wrapping at the ends', () => {
    const onTabChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={THREE_TABS}
        activeTab="mangadex"
        onTabChange={onTabChange}
      />
    ));
    fireEvent.click(trigger(container));
    const [first, middle, last] = tabButtons() as [
      HTMLButtonElement,
      HTMLButtonElement,
      HTMLButtonElement,
    ];

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(middle);
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(middle, { key: 'End' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(middle, { key: 'Home' });
    expect(document.activeElement).toBe(first);

    // Manual activation: moving focus must not select, or a caller that
    // re-queries per tab would fetch once for every keypress.
    expect(onTabChange).not.toHaveBeenCalled();
    // ...and the selection is unmoved.
    expect(first.getAttribute('aria-selected')).toBe('true');
  });

  it('activates the focused tab on Enter', () => {
    const onTabChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={THREE_TABS}
        activeTab="mangadex"
        onTabChange={onTabChange}
      />
    ));
    fireEvent.click(trigger(container));
    fireEvent.keyDown(tabButtons()[0]!, { key: 'ArrowRight' });
    // A native <button> turns Enter/Space into a click; assert through the
    // click the browser would synthesise on the now-focused tab.
    fireEvent.click(document.activeElement!);
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('nhentai');
  });

  it('arrow keys reach the right tab after `tabs` shrinks while open', () => {
    const [tabs, setTabs] = createSignal<typeof THREE_TABS>(THREE_TABS);
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={tabs()}
        activeTab="mangadex"
      />
    ));
    fireEvent.click(trigger(container));
    // Same objects, middle one removed: `For` keeps the surviving buttons.
    setTabs([THREE_TABS[0]!, THREE_TABS[2]!]);
    const [first, last] = tabButtons() as [HTMLButtonElement, HTMLButtonElement];
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(last);
  });

  it('falls back to the first tab when `activeTab` names no tab', () => {
    // A caller whose tab list is fed by an async query can hold an id that
    // has since vanished; the strip must not end up with zero selected
    // tabs and therefore zero tab stops.
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={TABS}
        activeTab="a-source-that-was-removed"
      />
    ));
    fireEvent.click(trigger(container));
    const tabs = tabButtons();
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('pairs each tab with the option list via aria-controls', () => {
    const { container } = render(() => (
      <ChipFlyout
        mode="multi"
        label="Tags"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        tabs={TABS}
        activeTab="local"
      />
    ));
    fireEvent.click(trigger(container));
    const panel = document.querySelector('[role="tabpanel"]')!;
    expect(panel).not.toBeNull();
    const tabs = tabButtons();
    for (const t of tabs) {
      expect(t.getAttribute('aria-controls')).toBe(panel.id);
    }
    // The panel names the ACTIVE tab as its label.
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1]!.id);
    // The chips live inside it.
    expect(panel.querySelector('.cujuju-cf-chips')).not.toBeNull();
  });

  it('adds no tabpanel role when there are no tabs', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(document.querySelector('[role="tabpanel"]')).toBeNull();
    // The wrapper still renders, so layout is identical either way.
    expect(document.querySelector('.cujuju-cf-tabpanel')).not.toBeNull();
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

describe('ChipFlyout — harness teardown', () => {
  // Guards the testing-library inline in vitest.config: a second Solid instance
  // leaves the component undisposed, leaking its Portal and document listeners.
  it('cleanup() disposes the panel and its document listeners', () => {
    const onOpenChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onOpenChange={onOpenChange} />
    ));
    fireEvent.click(trigger(container));
    cleanup();
    expect(panel()).toBeNull();
    onOpenChange.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('ChipFlyout — controlled open', () => {
  it('renders the panel when mounted with open={true}', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} open={true} onOpenChange={() => {}} />
    ));
    expect(trigger(container).getAttribute('aria-expanded')).toBe('true');
    expect(panel()).not.toBeNull();
    expect(chips()).toHaveLength(2);
  });

  it('clamps a panel mounted open into the viewport', async () => {
    const PANEL_WIDTH = 400;
    const PANEL_HEIGHT = 100;
    const TRIGGER_WIDTH = 60;
    const TRIGGER_HEIGHT = 28;
    // Trigger hugging the right edge, so the unclamped panel overflows it.
    const triggerLeft = window.innerWidth - TRIGGER_WIDTH;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const isPanel = this.classList.contains('cujuju-cf-panel');
      const left = isPanel ? 0 : triggerLeft;
      const width = isPanel ? PANEL_WIDTH : TRIGGER_WIDTH;
      const height = isPanel ? PANEL_HEIGHT : TRIGGER_HEIGHT;
      return { x: left, y: 0, left, top: 0, width, height, right: left + width, bottom: height, toJSON: () => ({}) } as DOMRect;
    });
    render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} open={true} onOpenChange={() => {}} />
    ));
    await vi.waitFor(() => {
      expect(panel()?.style.left).toBe(`${window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN_PX}px`);
    });
  });
});

describe('ChipFlyout — onOpenChange reports changes only', () => {
  it('does not report a close on resize while uncontrolled and closed', () => {
    const onOpenChange = vi.fn();
    render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onOpenChange={onOpenChange} />
    ));
    window.dispatchEvent(new Event('resize'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not report a close on resize while controlled closed', () => {
    const onOpenChange = vi.fn();
    render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} open={false} onOpenChange={onOpenChange} />
    ));
    window.dispatchEvent(new Event('resize'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('still reports the close when resize dismisses an open panel', () => {
    const onOpenChange = vi.fn();
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onOpenChange={onOpenChange} />
    ));
    fireEvent.click(trigger(container));
    onOpenChange.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(panel()).toBeNull();
  });
});

describe('ChipFlyout — focus management', () => {
  const TABS = [
    { id: 'mangadex', label: 'MangaDex' },
    { id: 'local', label: 'Local' },
  ];

  it('moves focus into the search input on open', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onSearchInput={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(document.activeElement).toBe(document.querySelector('.cujuju-cf-search'));
  });

  it('moves focus to the active tab on open when there is no search input', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} tabs={TABS} activeTab="local" />
    ));
    fireEvent.click(trigger(container));
    expect(document.activeElement?.textContent).toBe('Local');
  });

  it('moves focus to the panel itself when it has no search input or tabs', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(document.activeElement).toBe(panel());
  });

  it('restores focus to the trigger when Escape closes the panel', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onSearchInput={() => {}} />
    ));
    fireEvent.click(trigger(container));
    document.querySelector<HTMLInputElement>('.cujuju-cf-search')!.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
  });

  it('restores focus to the trigger when the close button closes the panel', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onSearchInput={() => {}} />
    ));
    fireEvent.click(trigger(container));
    const close = document.querySelector<HTMLButtonElement>('.cujuju-glass-menu-close')!;
    close.focus();
    fireEvent.click(close);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
  });

  it('does not pull focus to the trigger when an outside click closes the panel', () => {
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onSearchInput={() => {}} />
    ));
    fireEvent.click(trigger(container));
    document.querySelector<HTMLInputElement>('.cujuju-cf-search')!.focus();
    fireEvent.pointerDown(document.body);
    expect(panel()).toBeNull();
    expect(document.activeElement).not.toBe(trigger(container));
  });

  it('keeps focus in the panel when a controlled parent vetoes the close', () => {
    render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} open={true} onOpenChange={() => {}} onSearchInput={() => {}} />
    ));
    const search = document.querySelector<HTMLInputElement>('.cujuju-cf-search')!;
    search.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel()).not.toBeNull();
    expect(document.activeElement).toBe(search);
  });

  function renderParentControlled() {
    const [open, setOpen] = createSignal(false);
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} open={open()} onOpenChange={setOpen} onSearchInput={() => {}} />
    ));
    return { container, setOpen };
  }

  it('moves focus into the panel on a parent-driven open', () => {
    const { setOpen } = renderParentControlled();
    setOpen(true);
    expect(document.activeElement).toBe(document.querySelector('.cujuju-cf-search'));
  });

  it('restores focus to the trigger on a parent-driven close', () => {
    const { container, setOpen } = renderParentControlled();
    setOpen(true);
    document.querySelector<HTMLInputElement>('.cujuju-cf-search')!.focus();
    setOpen(false);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
  });

  it('does not take focus when mounted open', () => {
    render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} open={true} onOpenChange={() => {}} onSearchInput={() => {}} />
    ));
    expect(panel()).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('skips the search input on a coarse pointer, so no soft keyboard opens', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }) as unknown as MediaQueryList);
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={OPTIONS} value={[]} onChange={() => {}} onSearchInput={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(document.activeElement).toBe(panel());
  });
});

describe('ChipFlyout — non-neutral chips sort first', () => {
  const ABC = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ];
  const LABELS = ['Alpha', 'Beta', 'Gamma', 'One', 'Two'];

  /** Chip labels in DOM order. Matched by label so a state glyph can't break the read. */
  function chipOrder(): (string | undefined)[] {
    return chips().map((c) => LABELS.find((l) => c.textContent!.includes(l)));
  }
  function chipByLabel(label: string): HTMLButtonElement {
    const el = chips().find((c) => c.textContent!.includes(label));
    if (!el) throw new Error(`expected a chip labelled ${label}`);
    return el;
  }

  function renderMulti(initial: string[], options: ChipOption[] = ABC, extra: { sort?: boolean } = {}) {
    const [value, setValue] = createSignal<string[]>(initial);
    const { container } = render(() => (
      <ChipFlyout mode="multi" label="Tags" options={options} value={value()} onChange={setValue} sort={extra.sort} />
    ));
    return container;
  }

  it('hoists chips that are non-neutral when the panel opens', () => {
    const container = renderMulti(['c']);
    fireEvent.click(trigger(container));
    expect(chipOrder()).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('hoists both enabled and disabled tri-state chips, keeping their order', () => {
    const { container } = render(() => (
      <ChipFlyout mode="tri-state" label="Status" options={ABC} value={{ included: ['c'], excluded: ['b'] }} onChange={() => {}} />
    ));
    fireEvent.click(trigger(container));
    expect(chipOrder()).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('does not move a chip toggled while open, in either direction', () => {
    const container = renderMulti(['c']);
    fireEvent.click(trigger(container));
    fireEvent.click(chipByLabel('Beta'));
    expect(chipOrder()).toEqual(['Gamma', 'Alpha', 'Beta']);
    fireEvent.click(chipByLabel('Gamma'));
    expect(chipOrder()).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('re-sorts on the next open', () => {
    const container = renderMulti(['c']);
    fireEvent.click(trigger(container));
    fireEvent.click(chipByLabel('Gamma'));
    fireEvent.click(chipByLabel('Beta'));
    fireEvent.click(trigger(container));
    fireEvent.click(trigger(container));
    expect(chipOrder()).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('respects `sort` within the hoisted and remaining runs', () => {
    const container = renderMulti(['c', 'b'], [ABC[2]!, ABC[1]!, ABC[0]!], { sort: true });
    fireEvent.click(trigger(container));
    expect(chipOrder()).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('hoists within its group and leaves group order alone', () => {
    const container = renderMulti(['2'], [
      { value: 'a', label: 'Alpha', group: 'letters' },
      { value: 'b', label: 'Beta', group: 'letters' },
      { value: '1', label: 'One', group: 'numbers' },
      { value: '2', label: 'Two', group: 'numbers' },
    ]);
    fireEvent.click(trigger(container));
    const headers = [...document.querySelectorAll('.cujuju-cf-group-header')];
    expect(headers.map((h) => h.textContent)).toEqual(['Letters', 'Numbers']);
    expect(chipOrder()).toEqual(['Alpha', 'Beta', 'Two', 'One']);
  });

  it('does not move a tri-state chip cycled through every state while open', () => {
    const [value, setValue] = createSignal<TriStateValue>({ included: ['c'], excluded: [] });
    const { container } = render(() => (
      <ChipFlyout mode="tri-state" label="Status" options={ABC} value={value()} onChange={setValue} />
    ));
    fireEvent.click(trigger(container));
    const atOpen = ['Gamma', 'Alpha', 'Beta'];
    expect(chipOrder()).toEqual(atOpen);
    fireEvent.click(chipByLabel('Beta')); // included
    fireEvent.click(chipByLabel('Beta')); // excluded
    fireEvent.click(chipByLabel('Gamma')); // excluded
    expect(chipOrder()).toEqual(atOpen);
    fireEvent.click(chipByLabel('Gamma')); // unselected
    expect(chipOrder()).toEqual(atOpen);
  });

  it('snapshots on a parent-driven open and re-sorts on the next one', () => {
    const [open, setOpen] = createSignal(false);
    const [value, setValue] = createSignal<string[]>(['c']);
    render(() => (
      <ChipFlyout mode="multi" label="Tags" options={ABC} value={value()} onChange={setValue} open={open()} onOpenChange={setOpen} />
    ));
    setOpen(true);
    expect(chipOrder()).toEqual(['Gamma', 'Alpha', 'Beta']);
    fireEvent.click(chipByLabel('Beta'));
    expect(chipOrder()).toEqual(['Gamma', 'Alpha', 'Beta']);
    setOpen(false);
    setOpen(true);
    expect(chipOrder()).toEqual(['Beta', 'Gamma', 'Alpha']);
  });
});
