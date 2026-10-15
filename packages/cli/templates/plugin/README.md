# {{displayName}}

`{{pluginId}}` was created with the Weaver CLI.

The plugin directory name is `{{pluginName}}`.

## Start developing

This plugin depends on `@weaver/cli` and `@weaver/sdk` through `workspace:*`. Neither package is published to npm, so the plugin must live in the `plugins/` directory of a Weaver checkout, and the checkout must have run `pnpm build`.

```bash
pnpm install
pnpm validate
pnpm build
```

The Weaver API discovers the plugin in `plugins/` and serves `dist/client/remoteEntry.js`. Install it for a tenant from Administration, then Plugins, or with `POST /api/v1/plugins/install`.

## Hot reload

Start the plugin dev server on a fixed port:

```bash
pnpm dev --port 5199
```

Then start the API with the same address, so it redirects the plugin bundle to the dev server:

```text
WEAVER_PLUGIN_DEV_SERVERS={"{{pluginId}}":"http://localhost:5199"}
```

Restart the API after changing that value. Pass CLI options to `pnpm dev` directly, without `--`. The dev server also proxies `/api` to `http://localhost:3000`; change that with `--weaver-url`.

## Structure

- `weaver-plugin.json` declares routes, permissions, events, and UI contributions.
- `src/server/index.ts` contains lifecycle hooks.
- `src/server/handlers.ts` exports manifest route handlers.
- `src/client/index.ts` exports components referenced by the manifest.
- `vite.config.ts` builds the runtime-loaded federation bundle.

See the Weaver plugin development, manifest, and API reference documentation in `docs/` for all extension points.
