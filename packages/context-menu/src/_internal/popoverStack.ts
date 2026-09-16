/**
 * Package-private: a submenu Portal'd to `<body>` still counts as "inside" for dismiss.
 * Participants carry `data-popover-stack` — a cross-boundary WIRE CONTRACT; renaming it breaks
 * every coordinating host surface.
 */

/** HTML data attribute marking a popover-stack participant. */
export const POPOVER_STACK_ATTR = 'data-popover-stack';

/** CSS selector form of {@link POPOVER_STACK_ATTR}, for `closest()`. */
export const POPOVER_STACK_ATTR_SELECTOR = '[data-popover-stack]';
