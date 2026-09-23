# Compose deployment template

This template runs the API, worker, web server, PostgreSQL, and Redis. Only the
web server is published, on a loopback port for an HTTPS reverse proxy. Database
files, Redis data, and uploads use persistent Docker volumes.

The API uses `NODE_ENV=production`. Production authentication checks apply and
TypeORM schema synchronization is disabled. This is a deployment building block;
database preparation, TLS, backups, and release acceptance remain operator work.

## Configure an installation

Copy `.env.example` from this directory to a protected file outside the checkout
and restrict it to the operator account. Set its absolute path in `WEAVER_ENV_FILE`.
The examples below run from the repository root.

- Set `COMPOSE_PROJECT_NAME` to the installation's permanent project name. For
  an existing installation, preserve its current name so Compose selects the
  existing database, Redis, and upload volumes.
- Set `WEAVER_PUBLIC_URL` to the HTTPS origin, for example
  `https://weaver.example.com`, without a path or trailing slash. This configures
  the public API URL, frontend URLs, and CORS origin. The API prefix is `api/v1`.
- Set separate random database, Redis, JWT, and refresh-token secrets. Each JWT
  secret must contain at least 32 characters, and the two must differ.
- Set `WEAVER_API_IMAGE`, `WEAVER_WORKER_IMAGE`, and `WEAVER_WEB_IMAGE` to reviewed
  image tags or digests. Preserve those pins when changing configuration.
- Choose `WEB_PORT` for the host's loopback listener and configure an HTTPS
  reverse proxy to forward to it.

The optional Google and GitHub credentials reach only the API at runtime. See
[OAuth sign-in](../../docs/wiki/OAuth-Sign-In.md) for callback registration and
credential changes.

Validate the configuration without printing resolved credentials:

```sh
docker compose --env-file "$WEAVER_ENV_FILE" -f deploy/compose/compose.yaml config --quiet
```

For a reviewed source revision, build the installation's configured image tags:

```sh
docker compose --env-file "$WEAVER_ENV_FILE" -f deploy/compose/compose.yaml build
```

Image digests are suitable for running previously built images; use writable
tags when building. The Dockerfile builds all workspaces and verifies production
plugin bundles. After database preparation and backup review, start the stack:

```sh
docker compose --env-file "$WEAVER_ENV_FILE" -f deploy/compose/compose.yaml up -d --no-build --wait
```

## Database preparation and upgrades

There is no universal database bootstrap or upgrade plan in this directory.
Generate and review a plan for the exact database baseline and source revision.
Back up the database, uploads, protected environment, Compose configuration,
and image references before applying changes. Rehearse the plan and its inverse
on a restored copy first.

`schema-plan.cjs` produces a read-only TypeORM diff for `public` and the tenant
schemas explicitly listed in `WEAVER_MIGRATION_SCHEMAS`. It requires the built
database package and the target database environment variables. Store its output
outside this repository. For example, with `WEAVER_PLAN_FILE` set to a private
absolute path:

```sh
node deploy/compose/schema-plan.cjs > "$WEAVER_PLAN_FILE"
```

Review every statement and record the plan's SHA-256 in private release records.
`apply-schema-plan.cjs` requires that exact checksum, database target, and schema
scope. Apply only the reviewed plan, with `WEAVER_PLAN_SHA256` set to its checksum:

```sh
node deploy/compose/apply-schema-plan.cjs "$WEAVER_PLAN_FILE" "$WEAVER_PLAN_SHA256" up
```

The `down` direction applies the recorded inverse. Review its data effects before
using it; a SQL inverse is not a substitute for a restorable database backup.
The scripts read exported database environment variables, not the Compose env
file automatically. Keep connection values out of shell history and logs.

## Existing installations

When adopting this template path, update deployment automation to reference
`deploy/compose/compose.yaml`. Preserve the existing Compose project name, image
pins, database settings, host port, and volumes. Record the added
`WEAVER_PUBLIC_URL` explicitly. Validate the resolved configuration before any
service recreation. Keep the previous source revision and private release records
available for rollback.

## Configuration checks

The following tests use synthetic values and resolve Compose configuration
without starting containers:

```sh
node --test deploy/compose/oauth-config.test.cjs
```
