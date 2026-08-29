import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pluginId = WEAVER_PLUGIN_ID;
const remoteName = pluginId.replace(/[^A-Za-z0-9_]/g, '_');
const weaverUrl = process.env.WEAVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    federation({
      name: remoteName,
      filename: 'remoteEntry.js',
      exposes: {
        './plugin': './src/client/index.ts',
      },
      publicPath: 'auto',
      bundleAllCSS: true,
      manifest: true,
      dts: false,
      dev: { remoteHmr: true },
      disableRemote: true,
      shared: {
        react: { singleton: true, requiredVersion: false, import: false },
        'react/': { singleton: true, requiredVersion: false, import: false },
        'react/jsx-runtime': { singleton: true, requiredVersion: false, import: false },
        'react/jsx-dev-runtime': { singleton: true, requiredVersion: false, import: false },
        'react-dom': {
          singleton: true,
          requiredVersion: false,
          import: false,
          suppressMissingImportWarning: true,
        },
        zustand: {
          singleton: true,
          requiredVersion: false,
          import: false,
          suppressMissingImportWarning: true,
        },
        '@tanstack/react-query': {
          singleton: true,
          requiredVersion: false,
          import: false,
          suppressMissingImportWarning: true,
        },
      },
    }),
  ],
  server: {
    cors: true,
    proxy: {
      '/api': { target: weaverUrl, changeOrigin: true },
      '/plugin-routes': { target: weaverUrl, changeOrigin: true },
    },
  },
  build: {
    assetsDir: '',
    emptyOutDir: true,
    outDir: 'dist/client',
    rollupOptions: { input: 'src/client/index.ts' },
    target: 'chrome89',
  },
});
