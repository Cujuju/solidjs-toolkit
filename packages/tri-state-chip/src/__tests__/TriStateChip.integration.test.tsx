import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { TriStateChip } from '../TriStateChip';

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

function findChip(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>('button.ctc-chip');
  if (!el) throw new Error('expected .ctc-chip');
  return el;
}

describe('TriStateChip rendering', () => {
  it('renders label text', () => {
    dispose = render(
      () => <TriStateChip label="Action" value="unselected" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().textContent).toBe('Action');
  });

  it('reflects state in data-state attribute', () => {
    dispose = render(
      () => <TriStateChip label="X" value="included" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().getAttribute('data-state')).toBe('included');
  });

  it('aria-pressed=false when unselected', () => {
    dispose = render(
      () => <TriStateChip label="X" value="unselected" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().getAttribute('aria-pressed')).toBe('false');
  });

  it('aria-pressed=true when included', () => {
    dispose = render(
      () => <TriStateChip label="X" value="included" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().getAttribute('aria-pressed')).toBe('true');
  });

  it('aria-pressed=true when excluded', () => {
    dispose = render(
      () => <TriStateChip label="X" value="excluded" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().getAttribute('aria-pressed')).toBe('true');
  });

  it('renders default include prefix when state=included', () => {
    dispose = render(
      () => <TriStateChip label="X" value="included" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().textContent).toBe('+ X');
  });

  it('renders default exclude prefix when state=excluded', () => {
    dispose = render(
      () => <TriStateChip label="X" value="excluded" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().textContent).toBe('− X');
  });

  it('omits prefix when prefix prop is empty string', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="included"
          includePrefix=""
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().textContent).toBe('X');
  });

  it('custom prefix is rendered verbatim', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="excluded"
          excludePrefix="(NO) "
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().textContent).toBe('(NO) X');
  });

  it('passes ariaLabel through', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="unselected"
          ariaLabel="Genre: X (neutral)"
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().getAttribute('aria-label')).toBe('Genre: X (neutral)');
  });

  it('spreads dataAttr on the root', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="unselected"
          dataAttr={{ 'data-testid': 'chip-x' }}
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().getAttribute('data-testid')).toBe('chip-x');
  });
});

describe('TriStateChip cycling', () => {
  it('default cycle: unselected → included', () => {
    const onCycle = vi.fn();
    dispose = render(
      () => <TriStateChip label="X" value="unselected" onCycle={onCycle} />,
      document.body,
    );
    findChip().click();
    expect(onCycle).toHaveBeenCalledWith('included');
  });

  it('default cycle: included → excluded', () => {
    const onCycle = vi.fn();
    dispose = render(
      () => <TriStateChip label="X" value="included" onCycle={onCycle} />,
      document.body,
    );
    findChip().click();
    expect(onCycle).toHaveBeenCalledWith('excluded');
  });

  it('default cycle: excluded → unselected', () => {
    const onCycle = vi.fn();
    dispose = render(
      () => <TriStateChip label="X" value="excluded" onCycle={onCycle} />,
      document.body,
    );
    findChip().click();
    expect(onCycle).toHaveBeenCalledWith('unselected');
  });

  it('custom nextState overrides the default cycle', () => {
    const onCycle = vi.fn();
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="unselected"
          // Two-state custom: unselected ↔ excluded (skip included).
          nextState={(c) => (c === 'unselected' ? 'excluded' : 'unselected')}
          onCycle={onCycle}
        />
      ),
      document.body,
    );
    findChip().click();
    expect(onCycle).toHaveBeenCalledWith('excluded');
  });
});

describe('TriStateChip disabled', () => {
  it('disabled chip suppresses onCycle on click', () => {
    const onCycle = vi.fn();
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="unselected"
          disabled
          onCycle={onCycle}
        />
      ),
      document.body,
    );
    findChip().click();
    expect(onCycle).not.toHaveBeenCalled();
  });

  it('disabled chip sets the disabled HTML attribute', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="unselected"
          disabled
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().disabled).toBe(true);
  });
});

describe('TriStateChip click event handling', () => {
  it('calls stopPropagation on the click event', () => {
    // Solid uses delegated events at the document root, so testing
    // bubble-vs-no-bubble against a parent listener races the delegation
    // order. Spy directly on stopPropagation instead — that's the contract
    // we control inside the click handler.
    const onCycle = vi.fn();
    dispose = render(
      () => <TriStateChip label="X" value="unselected" onCycle={onCycle} />,
      document.body,
    );
    const evt = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(evt, 'stopPropagation');
    findChip().dispatchEvent(evt);
    expect(stopSpy).toHaveBeenCalled();
    expect(onCycle).toHaveBeenCalledTimes(1);
  });
});
