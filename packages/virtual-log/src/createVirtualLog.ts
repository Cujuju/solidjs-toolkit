import type { VirtualLogOptions, VirtualLogController } from './types.js';
import { createLogLayout } from './createLogLayout.js';
import { createLogMeasurement } from './createLogMeasurement.js';
import { createLogController } from './createLogController.js';

export type { VirtualLogOptions, VirtualLogController } from './types.js';

/** A virtualized, bottom-anchored log; scrolling corrections move from shift into the offset once the scroller rests. */
export function createVirtualLog<R>(o: VirtualLogOptions<R>): VirtualLogController<R> {
  const s = createLogLayout(o, () => m.checkEdges());
  const m = createLogMeasurement(o, s);
  return createLogController(o, s, m);
}
