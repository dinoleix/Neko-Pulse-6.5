import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
    const releaseId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Note: the Gemini API key is intentionally NOT injected into the client
    // bundle. OCR runs server-side via /api/parse-order (see services/geminiService.ts).
    return {
      define: { __NEKO_RELEASE__: JSON.stringify(releaseId) },
      plugins: [{
        name: 'neko-release-manifest',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ releaseId }) });
        },
      }],
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      esbuild: {
        jsx: 'automatic' as const,
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
