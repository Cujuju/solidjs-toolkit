import type { VirtualLogOptions, VirtualLogController } from './types';
import { createLogLayout } from './createLogLayout';
import { createLogMeasurement } from './createLogMeasurement';
import { createLogController } from './createLogController';

export type { VirtualLogOptions, VirtualLogController } from './types';

/** A virtualized, bottom-anchored log; scrolling corrections move from shift into the offset once the scroller rests. */
export function createVirtualLog<R>(o: VirtualLogOptions<R>): VirtualLogController<R> {
  const s = createLogLayout(o, () => m.checkEdges());
  const m = createLogMeasurement(o, s);
  return createLogController(o, s, m);
}
