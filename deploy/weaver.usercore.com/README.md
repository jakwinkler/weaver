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

## Google and GitHub sign-in

Each provider needs its own registered OAuth application and a client ID/secret
pair. A `503` response saying `OAuth is not configured` means the API cannot see
one or both credentials for that provider. The sign-in links alone do not prove
the provider is configured.

Use these settings for this deployment:

| Provider | Application type | Callback URL |
| --- | --- | --- |
| Google | Web application | `https://weaver.usercore.com/api/v1/auth/google/callback` |
| GitHub | OAuth App | `https://weaver.usercore.com/api/v1/auth/github/callback` |

For Google, configure the consent screen and create the client in
[Google Auth Platform](https://console.cloud.google.com/auth/clients). Register
the exact callback above as an authorized redirect URI. See Google's
[web server OAuth instructions](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred).

For GitHub, follow the
[OAuth App registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
Use `Weaver` as the application name, `https://weaver.usercore.com` as the
homepage, and the exact GitHub callback above. Generate a client secret after
registering the app. The login flow requests `user:email` access.

Store the four values in `/opt/weaver/shared/.env` on the host, keeping mode
`0600`. Supply them through a secure editor or credential manager; never put
them in Git, chat, command arguments, or build arguments:

```dotenv
GOOGLE_CLIENT_ID=<Google client ID>
GOOGLE_CLIENT_SECRET=<Google client secret>
GITHUB_CLIENT_ID=<GitHub client ID>
GITHUB_CLIENT_SECRET=<GitHub client secret>
```

Compose passes these values only to the API at runtime. Either provider can
remain unset, but its sign-in endpoint will return `503`. The callback URLs are
derived from the API's fixed public URL and prefix in `compose.yaml`.

Before an approved live change, retain protected copies of the existing
environment and Compose files, record the current API image ID, and review a
redacted diff. The configuration change affects four API environment variables
and requires recreating the API container. Retain the release-specific
`release.env` so the current image tags remain pinned. From the release's
`deploy/weaver.usercore.com` directory, validate without printing secrets:

```sh
docker compose --env-file /opt/weaver/shared/.env --env-file ../../release.env config --quiet
```

After approval, apply the configuration to the existing API image:

```sh
docker compose --env-file /opt/weaver/shared/.env --env-file ../../release.env \
  up -d --no-deps --no-build --force-recreate api
```

Once the API is healthy, reload the web proxy so Nginx resolves the recreated
API container's address:

```sh
docker compose --env-file /opt/weaver/shared/.env --env-file ../../release.env exec -T web nginx -t
docker compose --env-file /opt/weaver/shared/.env --env-file ../../release.env exec -T web nginx -s reload
```

Check `/api/v1/health` and both public sign-in endpoints. Each configured provider
must return `302` to its own authorization page with the exact callback URL and
a secure, HTTP-only state cookie. Complete a real browser sign-in for each
provider to verify the credential exchange and Weaver session. A redirect
alone does not prove the whole login works.

To roll back, restore the protected environment and Compose copies, then
recreate only the API using the same pinned image and reload the web proxy after
API health passes. This configuration change
does not require a database migration or an application image rebuild.

Run the local configuration regression check with synthetic credentials:

```sh
node --test deploy/weaver.usercore.com/oauth-config.test.cjs
```
