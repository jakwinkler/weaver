# ADR 0001: Load client plugins with Module Federation

## Status

Accepted on August 28, 2026.

## Decision

Weaver loads client plugins as independent Vite Module Federation remotes. Each plugin exposes `./plugin` from `src/client/index.ts` and builds to `dist/client/remoteEntry.js`. The API discovers the existing `weaver-plugin.json`, adds a `clientBundle` URL, and serves only files below that plugin's compiled client directory.

The web app registers a remote only after it finds an enabled plugin contribution. React, React DOM, Zustand, and TanStack Query are shared singletons supplied by the host. A failed remote stays inside a plugin error boundary instead of taking down the application.

In development, `WEAVER_PLUGIN_DEV_SERVERS` maps plugin IDs to their Vite origins. The manifest URL points through the API asset route, which redirects development requests to the matching Vite server. Module Federation's React remote HMR keeps the host and remote on one React refresh runtime.

## Why this option

Static imports require a core edit and rebuild for every community plugin. Import maps remove that registry but still leave dependency sharing, version negotiation, CSS loading, and development updates for Weaver to design. A custom script loader has the same problems and creates a private module format.

Module Federation already handles runtime registration, named exposes, shared dependency negotiation, remote CSS, caching, and Vite development updates. It matches Weaver's existing Vite stack and keeps each plugin independently buildable.

## Consequences

- Installing a plugin does not require a core source change.
- Production deployments must build plugin workspaces before starting the API.
- `remoteEntry.js` is revalidated, while hashed chunks can be cached immutably.
- Client plugin code runs with the same browser authority as Weaver. Installation remains a trusted administrative action, not a security sandbox.
- Production loads plugins only from the deployment-owned `WEAVER_TRUSTED_PLUGINS` allowlist. Client bundle URLs must resolve to the exact same-origin API asset route, with no query string, fragment, or embedded credentials.
- Manifest permissions authorize Weaver users and UI contributions. They do not sandbox plugin code or limit the authority of a compromised bundle.
- A plugin that declares client UI but has no compiled remote returns a visible load failure. Server-only plugins do not receive a `clientBundle` URL.
