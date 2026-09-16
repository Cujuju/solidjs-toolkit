/*
 * Every stylesheet the control needs, imported HERE and nowhere else — the only entry point.
 * `styles.css` first. See DESIGN_NOTES.md § src/index.ts:1.
 */
import './styles.css';
import './autoHide.css';
import './rail.css';
import './breadcrumb.css';

export { Breadcrumb, type BreadcrumbProps } from './Breadcrumb';
export {
  buildCrumbPath,
  elideCrumbs,
  CRUMB_ELISION_THRESHOLD,
  type BreadcrumbEntry,
  type CrumbData,
  type CrumbPathOptions,
} from './breadcrumbPath';
export {
  createPanelMenu,
  buildPanelMenuItems,
  PANEL_MENU_LABELS,
  type PanelMenu,
  type PanelMenuOptions,
} from './panelMenu';
export { AccordionGroup, type AccordionGroupProps } from './AccordionGroup';
export { AccordionPanel, type AccordionPanelProps } from './AccordionPanel';
export { AccordionLeaf, type AccordionLeafProps } from './AccordionLeaf';
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
} from './context';
export {
  createLeafChain,
  bindLeafChain,
  leafChainFor,
  type LeafChain,
} from './leafChain';
export {
  createTearOff,
  TearOffOutlet,
  type AccordionTearOffApi,
  type TearOffController,
  type TearOffResult,
} from './tearOff';
export { DEFAULT_MIN_SIZE_PX } from './resize';
export {
  CONTENT_MAX_GROUP_FRACTION,
  CONTENT_SLACK_DIGITS,
  type AccordionDefaultSize,
} from './contentSize';
export {
  orderVisualOpen,
  survivesBulkClose,
  bulkClosableIds,
  type PanelPredicates,
  type VisualOrderInput,
} from './visualOrder';
