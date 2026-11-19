import { For, Show, type JSX } from 'solid-js';
import { MOVE_ZONES } from './createDockGesture.js';
import { DOCK_EDGE_SHARE, type DropZone } from './tileTree.js';

const PERCENT = 100;
const EDGE = DOCK_EDGE_SHARE * PERCENT;
const FAR_EDGE = PERCENT - EDGE;
const NEAR_LABEL = EDGE / 2;
const FAR_LABEL = PERCENT - NEAR_LABEL;
const MIDDLE = PERCENT / 2;
const corners = {
  nw: '0,0', ne: '100,0', se: '100,100', sw: '0,100',
  innerNW: `${EDGE},${EDGE}`, innerNE: `${FAR_EDGE},${EDGE}`,
  innerSE: `${FAR_EDGE},${FAR_EDGE}`, innerSW: `${EDGE},${FAR_EDGE}`,
};
const { nw, ne, se, sw, innerNW, innerNE, innerSE, innerSW } = corners;
const zones = {
  left: { points: [nw, innerNW, innerSW, sw], x: NEAR_LABEL, y: MIDDLE, label: 'Left' },
  right: { points: [ne, innerNE, innerSE, se], x: FAR_LABEL, y: MIDDLE, label: 'Right' },
  top: { points: [nw, ne, innerNE, innerNW], x: MIDDLE, y: NEAR_LABEL, label: 'Above' },
  bottom: { points: [sw, innerSW, innerSE, se], x: MIDDLE, y: FAR_LABEL, label: 'Below' },
  center: { points: [innerNW, innerNE, innerSE, innerSW], x: MIDDLE, y: MIDDLE, label: 'Swap' },
};

export function DockZoneGuides(props: {
  style: JSX.CSSProperties;
  active: DropZone | undefined;
  available: ReadonlySet<DropZone>;
  tabs: boolean;
}) {
  return (
    <div class="twm-dock-guides" style={props.style} aria-hidden="true">
      <svg class="twm-dock-map" viewBox={`0 0 ${PERCENT} ${PERCENT}`} preserveAspectRatio="none">
        <For each={MOVE_ZONES}>{(zone) => (
          <polygon points={zones[zone].points.join(' ')} vector-effect="non-scaling-stroke" />
        )}</For>
        <Show when={props.active}>{(zone) => (
          <polygon class="twm-dock-highlight" points={zones[zone()].points.join(' ')} vector-effect="non-scaling-stroke"
            data-blocked={!props.available.has(zone()) || undefined} />
        )}</Show>
      </svg>
      <For each={MOVE_ZONES}>{(zone) => (
        <span class="twm-dock-label" data-zone={zone} data-active={props.active === zone || undefined}
          data-blocked={!props.available.has(zone) || undefined} style={{ left: `${zones[zone].x}%`, top: `${zones[zone].y}%` }}>
          <span class="twm-dock-icon" />
          <span class="twm-dock-text">{zone === 'center' && props.tabs ? 'Swap / Tab' : zones[zone].label}</span>
        </span>
      )}</For>
    </div>
  );
}
