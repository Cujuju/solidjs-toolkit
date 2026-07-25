import './styles.css';
export {
  PillDatePicker,
  type PillDatePickerProps,
  type PillDateEntry,
  type PillDateItemState,
  type PillDateRowContext,
} from './PillDatePicker';
export {
  // The DTE math is exported because a consumer that renders expirations ELSEWHERE (a chain
  // header, a position row) must be able to compute the same number the same way. A second,
  // subtly-different DTE in the same app is worse than no DTE at all.
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
} from './_internal/dte';
export type { PopoutPlacement } from './_internal/popout';
