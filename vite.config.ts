import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 18473,
    proxy: {
      '/api': 'http://127.0.0.1:18487',
      '/ws': {
        target: 'ws://127.0.0.1:18487',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
