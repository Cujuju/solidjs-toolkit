/*
 * Every stylesheet the control needs, imported HERE and nowhere else — the only entry point.
 * `styles.css` first. See DESIGN_NOTES.md § src/index.ts:1.
 */
import './styles.css';
import './autoHide.css';
import './rail.css';
import './breadcrumb.css';

export { Breadcrumb, type BreadcrumbProps } from './Breadcrumb.js';
export {
  buildCrumbPath,
  elideCrumbs,
  CRUMB_ELISION_THRESHOLD,
  type BreadcrumbEntry,
  type CrumbData,
  type CrumbPathOptions,
} from './breadcrumbPath.js';
export {
  createPanelMenu,
  buildPanelMenuItems,
  PANEL_MENU_LABELS,
  type PanelMenu,
  type PanelMenuOptions,
} from './panelMenu.js';
export { AccordionGroup, type AccordionGroupProps } from './AccordionGroup.js';
export { AccordionPanel, type AccordionPanelProps } from './AccordionPanel.js';
export { AccordionLeaf, type AccordionLeafProps } from './AccordionLeaf.js';
export {
  useAccordionGroup,
  type AccordionGroupApi,
  type AccordionAppearance,
  type AccordionMode,
  type AccordionOrientation,
  type AccordionPolicy,
  type AccordionOpenPlacement,
  type AccordionRailSide,
  type AccordionLayout,
  type PanelBadge,
  type PanelMeta,
  ACCORDION_LAYOUT_VERSION,
} from './context.js';
export {
  createLeafChain,
  bindLeafChain,
  leafChainFor,
  type LeafChain,
} from './leafChain.js';
export {
  createTearOff,
  TearOffOutlet,
  type AccordionTearOffApi,
  type TearOffController,
  type TearOffResult,
} from './tearOff.js';
export { DEFAULT_MIN_SIZE_PX } from './resize.js';
export {
  CONTENT_MAX_GROUP_FRACTION,
  CONTENT_SLACK_DIGITS,
  type AccordionDefaultSize,
} from './contentSize.js';
export {
  orderVisualOpen,
  survivesBulkClose,
  bulkClosableIds,
  type PanelPredicates,
  type VisualOrderInput,
} from './visualOrder.js';
