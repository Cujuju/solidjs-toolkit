// Side-effect: register the trigger / panel / option chrome stylesheet.
// The `.glass-menu` surface stylesheet is pulled transitively by
// `@cujuju/solidjs-glass-menu` when `Flyout` imports `GlassMenu`.
import './select-flyout.css';

export { Flyout, type FlyoutOption, type FlyoutProps } from './Flyout';
