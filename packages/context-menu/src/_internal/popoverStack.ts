/**
 * Popover-stack taxonomy — package-private.
 *
 * `ContextMenu` Portals each submenu to `<body>`, so a submenu sits
 * OUTSIDE the menu root's DOM subtree. The menu's own outside-click
 * dismiss must still treat clicks inside a submenu as "inside", and any
 * OTHER popover the host has open must not dismiss when a click lands
 * in one of these submenus.
 *
 * The contract: a popover-stack participant carries the
 * `data-popover-stack` attribute. ContextMenu marks every Portal'd
 * submenu with it and skips dismiss for clicks inside any element that
 * `closest()`-matches it.
 *
 * IMPORTANT — `data-popover-stack` is a cross-boundary WIRE CONTRACT.
 * A host whose own popover machinery (e.g. an anchored-popover
 * dismiss-skip predicate) wants to coexist with ContextMenu submenus
 * must match the SAME literal attribute. Do not rename it without
 * updating every coordinating surface in the host application.
 */

/** HTML data attribute marking a popover-stack participant. */
export const POPOVER_STACK_ATTR = 'data-popover-stack';

/** CSS selector form of {@link POPOVER_STACK_ATTR}, for `closest()`. */
export const POPOVER_STACK_ATTR_SELECTOR = '[data-popover-stack]';
