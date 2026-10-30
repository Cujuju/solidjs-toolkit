import { libConfig } from '../_shared/vite.lib.config';
export default libConfig(__dirname, { extraEntries: { helpers: 'helpers.ts' } });
