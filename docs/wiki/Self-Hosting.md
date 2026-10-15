# Run Weaver locally and operate a deployment

A complete Weaver installation has a web app, an API, a background worker, PostgreSQL, Redis, and persistent file storage. A running web page alone does not establish that mail, imports, scheduled work, or plugin assets work.

Use a disposable local database for your first run. Production requires a deployment-specific configuration, backups, schema planning, and an actual browser acceptance check. The deployment material in this repository is not a one-command production installer for every environment.

## Local development setup

Use the package manager declared in `package.json`, currently pnpm 9.15.4. CI, `.nvmrc`, and the current Dockerfiles use Node 22.

From a clean checkout:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit the local `.env` before starting. Keep `API_PUBLIC_URL=http://localhost:3000` without the API prefix, `API_PREFIX=api/v1`, and `WEB_URL=http://localhost:5173`. The current example has one `API_PUBLIC_URL` assignment. Set separate random JWT signing secrets and match database/Redis connection settings to your local services.

The development Compose file supplies PostgreSQL 16 and Redis 7:

```sh
docker compose -f docker/docker-compose.dev.yml up -d
pnpm build
```

Check for existing containers named `weaver-postgres` and `weaver-redis`, and port conflicts, before using that Compose file. It creates persistent volumes. Do not remove those volumes as a troubleshooting shortcut if they contain work you want to keep.

Start the API and web app in separate terminals:

```sh
pnpm --filter @weaver/api dev
```

```sh
pnpm --filter @weaver/web dev
```

Start the built worker with the same configuration explicitly loaded:

```sh
node --env-file=.env apps/worker/dist/main.js
```

The API reads `.env` through its configuration module. The worker reads process environment directly; starting it without the same environment can connect it to the wrong database or Redis instance. Keep SMTP unset for a disposable walkthrough that should not send real mail. To try password reset locally, run a mail catcher such as Mailpit and point `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` at it, with `SMTP_ALLOW_PRIVATE_HOST=true` because it listens on your own machine.

Open `http://localhost:5173/register`, create a fictional organization, and follow [Getting Started](https://github.com/jakwinkler/weaver/wiki/Getting-Started). The API health endpoint is `http://localhost:3000/api/v1/health`.

## Check the whole local path

Create a project and issue. Edit it and reload. Add a comment. Open a board, enable a relevant plugin, and inspect a plugin panel. Submit an intake form and confirm the created issue. Create a narrow automation and inspect its execution result.

Check worker queues separately for imports, email, and scheduled automation handoff. Verify provider login and email delivery only when those integrations are configured and you intend their external effects.

## Before operating a shared deployment

Use HTTPS and correct public URLs, production-mode secrets/cookies, persistent storage, and a trusted plugin list. Back up PostgreSQL, attachments, protected configuration, and the package/image identifiers together. Rehearse restoration into a separate environment so a backup is more than a file that exists.

Production disables automatic TypeORM schema synchronization. Inspect and approve the exact migration plan for the intended database. The [Compose deployment template](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/deploy/compose/README.md) provides a read-only schema planner and an explicit apply step. Its examples are not universal migrations for any Weaver database. A deployment with schema synchronization disabled also needs the organization-invitations table before using the client invitation flow, and the password-reset-tokens table (`packages/db/migrations/20261015_password_reset_tokens.sql`) before password reset works.

## Mail and password reset

Password reset needs the installation's own mail server. Give both the API and the worker `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `SMTP_FROM_NAME`. The API checks them before it creates a reset link, and the worker sends the email. Without them, **Forgot password?** still shows its usual message, but no email leaves and the API logs a warning.

Reset email never uses an organization's mail server from **System Settings → Email**. That organization's owner controls the server and could read a member's reset link, which would also open the member's other organizations. Organization servers still send their own notifications.

The Compose template and `docker/docker-compose.yml` pass `SMTP_*` to both containers. The Kubernetes manifests don't list them; add them to the shared Weaver secret, which the API and worker both read.

The worker refuses an SMTP host on a private or loopback address. If your relay runs on a private network, set `SMTP_ALLOW_PRIVATE_HOST=true`. That applies only to the installation's server, never to an organization's.

Reset links point at `WEB_APP_URL`, or `WEB_URL` when it is unset. The bundled nginx keeps `/reset-password/` paths out of its access log and sends `Referrer-Policy: no-referrer` for them. If a proxy in front of Weaver logs request paths, exclude `/reset-password/` there too.

After a deployment, verify health, authentication, project access, plugin rendering, file upload/download, and the background functions you use. Retain the previous image/configuration and a tested database rollback or forward-repair plan.

For common symptoms, see [Troubleshooting](https://github.com/jakwinkler/weaver/wiki/Troubleshooting). For provider configuration, see [OAuth Sign In](https://github.com/jakwinkler/weaver/wiki/OAuth-Sign-In).

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

### Process and data boundaries

| Component | Responsibility |
| --- | --- |
| `apps/web` | React/Vite UI and federated plugin host |
| `apps/api` | Auth, tenant context, REST, live events, plugin loading, and several queue consumers |
| `apps/worker` | Event, webhook, notification email, account email, and import jobs, and scheduled-automation handoff |
| PostgreSQL | Public identity/install records and tenant project data |
| Redis | BullMQ queues, scheduling, and rate-limit state |
| Local or S3 storage | Attachments and other stored files |

### Configuration to verify

Database settings use `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, and `DATABASE_NAME`. Redis uses `REDIS_HOST`, `REDIS_PORT`, and optional `REDIS_PASSWORD`. Public routing uses `API_PORT`, `API_PREFIX`, `API_PUBLIC_URL`, `WEB_URL`, `WEB_APP_URL`, and `CORS_ORIGINS`.

Mail uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`, and `SMTP_ALLOW_PRIVATE_HOST`, set the same on the API and the worker. Account email, such as password reset, goes through its own queue, named by `ACCOUNT_MAIL_QUEUE_NAME` (default `account-mail`).

Storage uses `STORAGE_DRIVER`, `STORAGE_LOCAL_PATH`, or the S3 settings. The default attachment byte limit is 10 MiB through `ATTACHMENT_MAX_BYTES`. Production JWT access/refresh secrets must be strong, distinct values. Never put secrets in `VITE_` variables, which are client-visible build configuration.

If you use Jira import, supply the same `IMPORT_CREDENTIAL_KEY` to the API and worker through your secret store. It must encode 32 random bytes in base64. The worker rejects old unencrypted jobs, so finish or cancel pending imports before switching versions or rotating the key.

The web client uses `VITE_API_URL` or defaults to `http://localhost:3000/api/v1`. A built web deployment needs the intended API URL at build time and correct proxy behavior afterward.

### Validation boundaries

The original documentation walkthrough used main `1b1b370` with existing built packages and fresh isolated local data/services. Registration, core pages, intake, and an event automation were exercised. Its fresh-install commands were source-derived guidance, not a clean-machine installation certification. The later pilot readiness report records separate disposable local tests and an authorized deployment/live acceptance on earlier pilot commits. This page's October 15 update checks the deployment paths and runtime versions against `ce5494a`; it does not assert a live acceptance run on that revision.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/api/src/app.module.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/app.module.ts)
- [apps/api/src/core/database/database.module.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/database/database.module.ts)
- [apps/worker/src/config.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/worker/src/config.ts)
- [apps/worker/src/main.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/worker/src/main.ts)
- [apps/web/src/api/client.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/api/client.ts)
- [docker/docker-compose.dev.yml](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/docker/docker-compose.dev.yml)
- [.env.example](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/.env.example)
- [.github/workflows/ci.yml](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/.github/workflows/ci.yml)
- [deploy/weaver.usercore.com/README.md](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/deploy/weaver.usercore.com/README.md)

Runtime and deployment path update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [Compose guide](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/deploy/compose/README.md), [Dockerfile](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/deploy/compose/Dockerfile), [.env.example](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/.env.example), [import queue](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/import/import-queue.service.ts), and [pilot readiness](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/READINESS-2026-10-14.md).
