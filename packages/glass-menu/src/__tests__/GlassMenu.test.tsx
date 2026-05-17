import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { GlassMenu } from '../GlassMenu';

describe('GlassMenu', () => {
  it('renders the title', () => {
    const { getByText } = render(() => (
      <GlassMenu title="Filters">body</GlassMenu>
    ));
    expect(getByText('Filters')).toBeInTheDocument();
  });

  it('renders children in the body', () => {
    const { getByText } = render(() => (
      <GlassMenu title="T">
        <span>menu body content</span>
      </GlassMenu>
    ));
    expect(getByText('menu body content')).toBeInTheDocument();
  });

  it('renders the header action slot', () => {
    const { getByText } = render(() => (
      <GlassMenu title="T" headerAction={<button>Clear</button>}>
        body
      </GlassMenu>
    ));
    expect(getByText('Clear')).toBeInTheDocument();
  });

  it('renders a close button with an accessible label when onClose is given', () => {
    const { getByLabelText } = render(() => (
      <GlassMenu title="T" onClose={() => {}}>
        body
      </GlassMenu>
    ));
    expect(getByLabelText('Close')).toBeInTheDocument();
  });

  it('omits the close button when onClose is not provided', () => {
    const { queryByLabelText } = render(() => (
      <GlassMenu title="T">body</GlassMenu>
    ));
    expect(queryByLabelText('Close')).toBeNull();
  });

  it('invokes onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(() => (
      <GlassMenu title="T" onClose={onClose}>
        body
      </GlassMenu>
    ));
    fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('carries the .glass-menu surface class and merges a caller class', () => {
    const { container } = render(() => (
      <GlassMenu title="T" class="my-panel">
        body
      </GlassMenu>
    ));
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains('glass-menu')).toBe(true);
    expect(root.classList.contains('cujuju-glass-menu')).toBe(true);
    expect(root.classList.contains('my-panel')).toBe(true);
  });

  it('forwards passthrough attributes (role, aria-label) to the root', () => {
    const { container } = render(() => (
      <GlassMenu title="T" role="dialog" aria-label="Filter dialog">
        body
      </GlassMenu>
    ));
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-label')).toBe('Filter dialog');
  });

  it('forwards a ref to the root element', () => {
    let captured: HTMLDivElement | undefined;
    render(() => (
      <GlassMenu title="T" ref={(el) => (captured = el)}>
        body
      </GlassMenu>
    ));
    expect(captured).toBeInstanceOf(HTMLElement);
    expect(captured?.classList.contains('glass-menu')).toBe(true);
  });

  it('renders no header when title, headerAction and onClose are all omitted', () => {
    const { container } = render(() => <GlassMenu>just a body</GlassMenu>);
    expect(container.querySelector('.cujuju-glass-menu-header')).toBeNull();
    expect(
      container.querySelector('.cujuju-glass-menu-body')?.textContent,
    ).toBe('just a body');
  });

  it('renders the header when only onClose is provided (no title)', () => {
    const { container, getByLabelText } = render(() => (
      <GlassMenu onClose={() => {}}>body</GlassMenu>
    ));
    expect(container.querySelector('.cujuju-glass-menu-header')).not.toBeNull();
    expect(getByLabelText('Close')).toBeInTheDocument();
  });

  it('renders the header when only headerAction is provided (no title)', () => {
    const { container, getByText } = render(() => (
      <GlassMenu headerAction={<button>Act</button>}>body</GlassMenu>
    ));
    expect(container.querySelector('.cujuju-glass-menu-header')).not.toBeNull();
    expect(getByText('Act')).toBeInTheDocument();
  });

  it('keeps the header divider by default', () => {
    const { container } = render(() => <GlassMenu title="T">body</GlassMenu>);
    const header = container.querySelector('.cujuju-glass-menu-header')!;
    expect(header.classList.contains('cujuju-glass-menu-header--flush')).toBe(
      false,
    );
  });

  it('drops the header divider when headerDivider is false', () => {
    const { container } = render(() => (
      <GlassMenu title="T" headerDivider={false}>
        body
      </GlassMenu>
    ));
    const header = container.querySelector('.cujuju-glass-menu-header')!;
    expect(header.classList.contains('cujuju-glass-menu-header--flush')).toBe(
      true,
    );
  });
});
