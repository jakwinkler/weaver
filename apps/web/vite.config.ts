import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { federation } from '@module-federation/vite';
import moduleFederationConfig from './module-federation.config';

export default defineConfig({
  plugins: [react(), tailwindcss(), federation(moduleFederationConfig)],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
  build: {
    target: 'chrome89',
  },
});
