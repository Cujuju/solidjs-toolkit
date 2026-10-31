export interface FlyoutOption {
  value: string;
  label: string;
  disabled?: boolean;
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
}

