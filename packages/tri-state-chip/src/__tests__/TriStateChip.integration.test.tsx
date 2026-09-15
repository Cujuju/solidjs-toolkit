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

  it('renders default include prefix when indicator=glyph, state=included', () => {
    dispose = render(
      () => <TriStateChip label="X" value="included" indicator="glyph" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().textContent).toBe('✓ X');
  });

  it('renders default exclude prefix when indicator=glyph, state=excluded', () => {
    dispose = render(
      () => <TriStateChip label="X" value="excluded" indicator="glyph" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().textContent).toBe('✗ X');
  });

  it('omits prefix when prefix prop is empty string (glyph mode)', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="included"
          indicator="glyph"
          includePrefix=""
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().textContent).toBe('X');
  });

  it('custom prefix is rendered verbatim (glyph mode)', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="excluded"
          indicator="glyph"
          excludePrefix="(NO) "
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().textContent).toBe('(NO) X');
  });

  it('glyph-free indicators render no prefix and no glyph in textContent', () => {
    // Every indicator except `glyph` carries state in CSS, so text equals the label.
    // New indicators belong in this list.
    for (const indicator of [
      'hatch',
      'strike',
      'cut',
      'marks',
      'badge',
      'rail',
      'tint',
    ] as const) {
      dispose?.();
      dispose = render(
        () => (
          <TriStateChip label="X" value="excluded" indicator={indicator} onCycle={() => {}} />
        ),
        document.body,
      );
      expect(findChip().textContent).toBe('X');
      expect(findChip().getAttribute('data-indicator')).toBe(indicator);
      expect(findChip().querySelector('.ctc-chip-prefix')).toBeNull();
    }
  });

  it('default indicator is hatch — no prefix column, label is the text', () => {
    dispose = render(
      () => <TriStateChip label="X" value="excluded" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().getAttribute('data-indicator')).toBe('hatch');
    expect(findChip().querySelector('.ctc-chip-prefix')).toBeNull();
    expect(findChip().textContent).toBe('X');
  });

  it('hatch geometry props write the matching custom properties', () => {
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="excluded"
          onCycle={() => {}}
          hatchAngle="-45deg"
          hatchStripeWidth="4px"
          hatchGapWidth="6px"
        />
      ),
      document.body,
    );
    const style = findChip().style;
    expect(style.getPropertyValue('--ctc-hatch-angle')).toBe('-45deg');
    expect(style.getPropertyValue('--ctc-hatch-stripe-width')).toBe('4px');
    expect(style.getPropertyValue('--ctc-hatch-gap-width')).toBe('6px');
  });

  it('omitted hatch props write NOTHING, so the stylesheet value survives', () => {
    // The failure this guards: emitting an empty string instead of omitting
    // the declaration. `--ctc-hatch-angle: ''` is not "unset" — it invalidates
    // every var() that reads it and collapses the gradient to nothing.
    dispose = render(
      () => <TriStateChip label="X" value="excluded" onCycle={() => {}} hatchAngle="-45deg" />,
      document.body,
    );
    const style = findChip().style;
    expect(style.getPropertyValue('--ctc-hatch-angle')).toBe('-45deg');
    expect(style.getPropertyValue('--ctc-hatch-stripe-width')).toBe('');
    expect(style.getPropertyValue('--ctc-hatch-gap-width')).toBe('');
  });

  it('no data-glyph-empty when no glyph column renders (every prefix empty)', () => {
    // The centring rule shifts the label back by half the column; with no
    // column rendered, that shift pushes the label off-centre.
    dispose = render(
      () => (
        <TriStateChip
          label="X"
          value="included"
          indicator="glyph"
          includePrefix=""
          excludePrefix=""
          onCycle={() => {}}
        />
      ),
      document.body,
    );
    expect(findChip().querySelector('.ctc-chip-prefix')).toBeNull();
    expect(findChip().hasAttribute('data-glyph-empty')).toBe(false);
  });

  it('data-glyph-empty is set when the column renders but the current state has no glyph', () => {
    dispose = render(
      () => <TriStateChip label="X" value="unselected" indicator="glyph" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().querySelector('.ctc-chip-prefix')).not.toBeNull();
    expect(findChip().hasAttribute('data-glyph-empty')).toBe(true);
  });

  it('glyph indicator keeps the reserved prefix column', () => {
    dispose = render(
      () => <TriStateChip label="X" value="included" indicator="glyph" onCycle={() => {}} />,
      document.body,
    );
    expect(findChip().querySelector('.ctc-chip-prefix')).not.toBeNull();
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
    // Solid delegates events at the document root, so a parent listener races delegation
    // order; spy on stopPropagation, the contract we control.
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
