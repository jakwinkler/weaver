# Weaver plugin template

This is the smallest complete runtime-loaded plugin. It has a client page, a server route, a manifest, and a separate Module Federation build.

## Create a plugin

1. Copy this directory and change the package name, manifest ID, Vite `pluginId`, and development port.
2. Export every component named in `weaver-plugin.json` from `src/client/index.ts`.
3. Build the remote with `pnpm build` from the plugin directory. The API serves `dist/client/remoteEntry.js` and its chunks.
4. Install and enable the manifest ID through Weaver's plugin settings.

The browser receives the bundle URL from `GET /api/v1/plugins/available`. Core code does not need an import or registry change.

## Development

Run `pnpm dev` in the plugin directory. Then point the API at the Vite server:

```text
WEAVER_PLUGIN_DEV_SERVERS={"@weaver/plugin-template":"http://localhost:5188"}
```

Restart the API after changing that environment value. React component changes use cross-federation HMR. The plugin must keep its assigned port available because Vite runs with `strictPort` enabled.

## Shared packages

React, React DOM, Zustand, and TanStack Query come from the Weaver host as singletons. Do not bundle private copies. Plugin-owned CSS is loaded with the exposed module, so a plugin can add styles without rebuilding Weaver.
