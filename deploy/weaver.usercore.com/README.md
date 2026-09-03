# weaver.usercore.com live-testing deployment

This deployment runs Weaver in an isolated Docker Compose project behind Caddy.
Only the web container is published, on host loopback port 3400. Postgres and
Redis are private to the Compose network, and their data plus uploaded files use
persistent Docker volumes.

The API runs with `NODE_ENV=production`, so production cookie and secret checks
are active and TypeORM synchronization is disabled. The September 3 security
integration includes a reviewed, checksum-bound schema plan for the existing
`public` and `tenant_rocket_web` schemas. It adds refresh sessions and foreign-key
constraints without deleting existing project or issue data. This plan is tied
to that release baseline, not a general-purpose migration for other databases.

Before applying it, back up the database, uploads, environment file, source
revision, and all three running application image IDs. Restore the dump into a
disposable database and rehearse both directions. Stop API and worker writes,
take a final backup, and apply the plan with the exact checksum:

```sh
WEAVER_MIGRATION_SCHEMAS=tenant_rocket_web node deploy/weaver.usercore.com/apply-schema-plan.cjs \
  deploy/weaver.usercore.com/security-schema-20260903.json \
  6ccfb63d9e4cb9d394f98193cf683cd077971a70ae7e4916f433a47001554daf up
```

Supply database connection settings through the protected runtime environment.
Use `down` for the tested inverse before restoring the old images. Reversing the
plan removes newly created refresh sessions, requiring users to sign in again.
Never restore an older database over post-cutover writes without a recovery
decision. Keep the web maintenance gate closed until health and data checks pass.
The API and worker use UTC for legacy timezone-free database timestamps.

Server and browser plugin code is trusted deployment code, not sandboxed tenant
content. Set `WEAVER_TRUSTED_PLUGINS` to a comma-separated allowlist of plugin IDs
that were reviewed and built with the deployment. An empty value disables
production plugin loading.

The host keeps generated secrets in `/opt/weaver/shared/.env` with mode 0600.
Caddy terminates HTTPS at `weaver.usercore.com`, serves the deployment-specific
`robots.txt`, and applies an `X-Robots-Tag` noindex header to every response.

The deployed source revision is recorded in `/opt/weaver/DEPLOYED_REVISION`.
