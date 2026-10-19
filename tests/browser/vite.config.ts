import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  base: '/',
  build: { outDir: 'browser-test-dist', emptyOutDir: true, target: 'es2020', rollupOptions: { input: resolve('tests/browser/fixture.html') } },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true },
});
