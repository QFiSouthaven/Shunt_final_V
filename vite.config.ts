import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        // ⚠ DO NOT re-broaden host to '0.0.0.0' without an explicit reason.
        // Was '0.0.0.0' historically (LAN-reachable for phone/tablet testing);
        // tightened to '127.0.0.1' since that path was never exercised and
        // 0.0.0.0 binds the SPA to every interface on the host. CLAUDE.md L12
        // documents the tightening. See COWORK_HANDOFF_2026-05-11.md §7.5 #15.
        port: 3000,
        host: '127.0.0.1',
      },
      build: {
        target: 'esnext' // Support top-level await for pdfjs
      },
      optimizeDeps: {
        esbuildOptions: {
          target: 'esnext' // dev-time prebundle must also allow TLA (pdfjs-dist)
        }
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
