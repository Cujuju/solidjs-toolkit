import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// No JSX, so not the shared Solid lib config. The plugin stays external: one copy, the app's.
export default defineConfig({
  plugins: [dts({ rollupTypes: false, include: ['src/**/*'], exclude: ['src/__tests__/**'] })],
  build: {
    lib: { entry: resolve(__dirname, 'src/index.ts'), formats: ['es'], fileName: 'index' },
    rollupOptions: { external: ['@capgo/capacitor-updater'] },
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
  },
});
