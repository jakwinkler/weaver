import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pluginId = '@weaver/plugin-automatic-time';

function getPluginRemoteName(id: string): string {
  const slug = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  let hash = 0xcbf29ce484222325n;

  for (const character of id) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return `weaver_plugin_${slug}_${hash.toString(36)}`;
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    federation({
      name: getPluginRemoteName(pluginId),
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
        'react-router-dom': {
          singleton: true,
          requiredVersion: false,
          import: false,
        },
        react: {
          singleton: true,
          requiredVersion: false,
          import: false,
        },
        'react/': {
          singleton: true,
          requiredVersion: false,
          import: false,
        },
        'react/jsx-runtime': {
          singleton: true,
          requiredVersion: false,
          import: false,
        },
        'react/jsx-dev-runtime': {
          singleton: true,
          requiredVersion: false,
          import: false,
        },
        'react-dom': {
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
    origin: process.env.WEAVER_PLUGIN_DEV_ORIGIN || 'http://localhost:5189',
    port: 5189,
    strictPort: true,
  },
  preview: {
    cors: true,
    port: 5189,
    strictPort: true,
  },
  build: {
    assetsDir: '',
    emptyOutDir: true,
    outDir: 'dist/client',
    rollupOptions: {
      input: 'src/client/index.ts',
    },
    target: 'chrome89',
  },
});
