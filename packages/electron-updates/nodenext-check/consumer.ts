// NodeNext consumer of the built dist (#29). skipLibCheck is off so any unresolved .d.ts import
// fails (TS2834); the @ts-expect-error lines catch exports degrading to `any`.
import { createUpdater } from '@cujuju/electron-updates';
import { buildManifest } from '@cujuju/electron-updates/node';

// @ts-expect-error createUpdater is a function, not a number.
export const updater: number = createUpdater;
// @ts-expect-error buildManifest is a function, not a number.
export const manifest: number = buildManifest;
