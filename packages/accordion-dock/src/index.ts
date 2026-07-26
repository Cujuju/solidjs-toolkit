/*
 * Every stylesheet the control needs, imported HERE and nowhere else — this
 * module is the only entry point, so a file missing from this list has simply
 * never been loaded by anything.
 *
 * `autoHide.css` and `rail.css` were absent until 2026-07-24: both were written,
 * both were correct, and neither had ever reached a browser. Auto-hide flyouts
 * therefore kept their docked column in the layout (the panel's `display: none`
 * lived in the unloaded file), and the rail's overflow strategies never applied,
 * so it fell back to a scrollbar in a 40px strip. Nothing failed loudly, because
 * a missing stylesheet has no error state — it just looks like a layout bug.
 *
 * Order is deliberate: `styles.css` first, so the opt-in modes that follow can
 * override it at equal specificity.
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
