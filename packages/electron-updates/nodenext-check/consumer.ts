// NodeNext + skipLibCheck consumer of the built dist (#29). An unresolved .d.ts import turns
// exports into `any`, so each @ts-expect-error below goes unused and tsc fails.
import { createUpdater } from '@cujuju/electron-updates';
import { buildManifest } from '@cujuju/electron-updates/node';

// @ts-expect-error createUpdater is a function, not a number.
export const updater: number = createUpdater;
// @ts-expect-error buildManifest is a function, not a number.
export const manifest: number = buildManifest;
