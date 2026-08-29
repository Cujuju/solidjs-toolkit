// Side-effect: register the trigger / panel-content stylesheet. The
// panel surface + chrome stylesheets are pulled transitively by
// `@cujuju/solidjs-glass-menu` when `ChipFlyout` imports `GlassMenu`.
import './chip-flyout.css';

export {
  ChipFlyout,
  type ChipFlyoutProps,
  type ChipOption,
  type ChipFlyoutTab,
} from './ChipFlyout';

// Re-exported for convenience — a `tri-state` ChipFlyout consumer needs
// the value shape and its empty literal to seed and reset state.
export {
  EMPTY_TRI_STATE,
  type TriStateValue,
} from '@cujuju/solidjs-tri-state-chip';
