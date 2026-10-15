import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
// The compiled helper, because Node cannot load the SDK's TypeScript entry when Vite reads this file.
import { getPluginRemoteName, PLUGIN_REMOTE_EXPOSE } from '@weaver/sdk/dist/plugin-federation.js';
import { defineConfig } from 'vite';

const pluginId = WEAVER_PLUGIN_ID;
const weaverUrl = process.env.WEAVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    federation({
      name: getPluginRemoteName(pluginId),
      filename: 'remoteEntry.js',
      exposes: {
        [PLUGIN_REMOTE_EXPOSE]: './src/client/index.ts',
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
