# {{displayName}}

`{{pluginId}}` was created with `@weaver/cli`.

The plugin directory name is `{{pluginName}}`.

## Start developing

```bash
pnpm install
pnpm validate
pnpm dev
```

The dev server uses Vite HMR and proxies `/api` and `/plugin-routes` to `http://localhost:3000` by default. Point it at another Weaver instance with:

```bash
pnpm dev -- --weaver-url http://localhost:3001
```

## Build

```bash
pnpm build
```

The client federation bundle is written to `dist/client/remoteEntry.js`.

## Structure

- `weaver-plugin.json` declares routes, permissions, events, and UI contributions.
- `src/server/index.ts` contains lifecycle hooks.
- `src/server/handlers.ts` exports manifest route handlers.
- `src/client/index.ts` exports components referenced by the manifest.
- `vite.config.ts` builds the runtime-loaded federation bundle.

See the Weaver plugin development, manifest, and API reference documentation for all extension points.
