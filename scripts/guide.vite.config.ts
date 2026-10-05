import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({
  root: path.resolve(__dirname, '..'),
  define: { __NEKO_RELEASE__: JSON.stringify('local-guide-preview'), 'import.meta.env.VITE_GUIDE_SCREENSHOTS': JSON.stringify('true') },
  resolve: { alias: [{ find: /^(\.\.\/)+firebaseConfig$/, replacement: path.resolve(__dirname, 'guideFirebase.ts') }, { find: './firebaseConfig', replacement: path.resolve(__dirname, 'guideFirebase.ts') }] },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 3013, strictPort: true },
});
