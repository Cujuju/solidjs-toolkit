import './styles.css';
export {
  PillDatePicker,
  type PillDatePickerProps,
  type PillDateEntry,
  type PillDateItemState,
  type PillDateRowContext,
} from './PillDatePicker.js';
export {
  // The DTE math is exported so a consumer rendering expirations elsewhere computes the same
  // number the same way — two subtly different DTEs in one app is worse than none.
  daysToExpiration,
  formatMonthDay,
  formatLongDate,
  formatDte,
  resolveDteColor,
  DEFAULT_DTE_RAMP,
  DTE_EXPIRING_MAX_DAYS,
  DTE_URGENT_MAX_DAYS,
  DTE_NEAR_MAX_DAYS,
  type DteColorStop,
  type CalendarDate,
} from './_internal/dte.js';
export type { PopoutPlacement } from './_internal/popout.js';
