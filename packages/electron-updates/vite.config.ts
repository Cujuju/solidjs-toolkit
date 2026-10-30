import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

// Node-only (Electron main process and release scripts): no JSX, Node built-ins stay imports.
export default defineConfig({
  plugins: [dts({ rollupTypes: false, include: ['src/**/*'], exclude: ['src/__tests__/**'] })],
  build: {
    lib: {
      entry: { index: resolve(__dirname, 'src/index.ts'), node: resolve(__dirname, 'src/node/index.ts') },
      formats: ['es'],
    },
    rollupOptions: { external: [/^node:/, ...builtinModules] },
    target: 'node22',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
  },
});
