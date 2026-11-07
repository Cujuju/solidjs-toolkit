import type { GlassMenuSurface } from '@cujuju/solidjs-glass-menu';

export interface FlyoutOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Native tooltip on the option row. */
  title?: string;
}

export interface FlyoutProps {
  options: FlyoutOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Class on the trigger, for width/margin; structural styles (height, padding, chevron
   *  room) stay intact at equal specificity. */
  class?: string;
  /** Trigger ID — useful when an external `<label for=...>` references it. */
  id?: string;
  /** Native tooltip on the trigger. */
  title?: string;
  /** Panel surface: `glass` (default) or `plain`, a solid panel from host tokens. */
  surface?: GlassMenuSurface;
}

