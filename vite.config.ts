import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
    // Note: the Gemini API key is intentionally NOT injected into the client
    // bundle. OCR runs server-side via /api/parse-order (see services/geminiService.ts).
    return {
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
