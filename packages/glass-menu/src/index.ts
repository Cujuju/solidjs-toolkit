// Side-effect: pull the `.glass-menu` surface classes + glass tokens
// from `@cujuju/solidjs-glass`, then this package's header/body chrome.
import '@cujuju/solidjs-glass';
import './glass-menu.css';

export { GlassMenu, type GlassMenuProps } from './GlassMenu';
