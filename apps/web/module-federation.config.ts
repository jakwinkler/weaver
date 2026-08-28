import { createModuleFederationConfig } from '@module-federation/vite';

export default createModuleFederationConfig({
  name: 'weaver_host',
  dev: { remoteHmr: true },
  dts: false,
  shared: {
    react: { singleton: true, requiredVersion: '^18.3.1' },
    'react/': { singleton: true, requiredVersion: '^18.3.1' },
    'react/jsx-runtime': { singleton: true, requiredVersion: '^18.3.1' },
    'react/jsx-dev-runtime': { singleton: true, requiredVersion: '^18.3.1' },
    'react-dom': { singleton: true, requiredVersion: '^18.3.1' },
    zustand: { singleton: true, requiredVersion: '^5.0.2' },
    '@tanstack/react-query': {
      singleton: true,
      requiredVersion: '^5.62.7',
    },
  },
});
