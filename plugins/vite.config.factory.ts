import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { getPluginRemoteName, PLUGIN_REMOTE_EXPOSE } from '../packages/sdk/src/plugin-federation';
import { defineConfig } from 'vite';

interface PluginViteConfigOptions {
  pluginId: string;
  port: number;
}

export function createPluginViteConfig({ pluginId, port }: PluginViteConfigOptions) {
  const origin = process.env.WEAVER_PLUGIN_DEV_ORIGIN || `http://localhost:${port}`;

  return defineConfig({
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
      origin,
      port,
      strictPort: true,
    },
    preview: {
      cors: true,
      port,
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
}
