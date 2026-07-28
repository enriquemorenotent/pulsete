import path from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const backendHost = '127.0.0.1';
const backendPort = 18487;
const webPort = 18473;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web/src'),
    },
  },
  server: {
    port: webPort,
    proxy: {
      '/api': `http://${backendHost}:${backendPort}`,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/markdown-to-jsx')) {
            return 'assistant-markdown';
          }
          return id.includes('node_modules') ? 'vendor' : undefined;
        },
      },
    },
  },
});
