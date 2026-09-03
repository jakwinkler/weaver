# weaver.usercore.com live-testing deployment

This deployment runs Weaver in an isolated Docker Compose project behind Caddy.
Only the web container is published, on host loopback port 3400. Postgres and
Redis are private to the Compose network, and their data plus uploaded files use
persistent Docker volumes.

The API runs with `NODE_ENV=production`, so production cookie and secret checks
are active and TypeORM synchronization is disabled. Weaver does not yet have a
reviewed migration system. Treat this as a live-testing environment, not a
production deployment. Provision the database schema before first start, back
up the database volume before upgrades, and add reviewed migrations before
production use.

Server and browser plugin code is trusted deployment code, not sandboxed tenant
content. Set `WEAVER_TRUSTED_PLUGINS` to a comma-separated allowlist of plugin IDs
that were reviewed and built with the deployment. An empty value disables
production plugin loading.

The host keeps generated secrets in `/opt/weaver/shared/.env` with mode 0600.
Caddy terminates HTTPS at `weaver.usercore.com`, serves the deployment-specific
`robots.txt`, and applies an `X-Robots-Tag` noindex header to every response.

The deployed source revision is recorded in `/opt/weaver/DEPLOYED_REVISION`.
