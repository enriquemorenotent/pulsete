import path from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const isExpectedProxySocketClose = (error: Error & { code?: string }) =>
  error.code === 'ECONNRESET' || error.code === 'EPIPE';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web/src'),
    },
  },
  server: {
    port: 18473,
    proxy: {
      '/api': 'http://127.0.0.1:18487',
      '/ws': {
        target: 'ws://127.0.0.1:18487',
        ws: true,
        configure(proxy) {
          proxy.on('error', (error) => {
            if (isExpectedProxySocketClose(error)) {
              return;
            }
            console.error(error);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes('node_modules') ? 'vendor' : undefined;
        },
      },
    },
  },
});
