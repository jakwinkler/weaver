# Local functional browser suite

These Playwright tests create accounts, organizations, projects, and issues. They refuse non-local web or API hostnames. Run them only against disposable local Postgres and Redis services. The tests use random organization slugs and do not clean up their data; use fresh containers for each full run and remove them afterward. Repeated full runs against the same database can exhaust PostgreSQL's client limit.

## Start the local services

From the repository root, install dependencies and build the workspace packages. Install Playwright Chromium once if it is not present.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @weaver/web exec playwright install chromium
docker run --rm -d --name weaver-e2e-pg -e POSTGRES_USER=weaver -e POSTGRES_PASSWORD=weaver_dev -e POSTGRES_DB=weaver -p 127.0.0.1:15432:5432 postgres:16-alpine
docker run --rm -d --name weaver-e2e-redis -p 127.0.0.1:16380:6379 redis:7-alpine
until docker exec weaver-e2e-pg pg_isready -U weaver -d weaver; do sleep 1; done
docker exec weaver-e2e-pg createdb -U weaver weaver_e2e
```

Start the API in one terminal with local-only test secrets:

```sh
NODE_ENV=development DATABASE_HOST=127.0.0.1 DATABASE_PORT=15432 REDIS_HOST=127.0.0.1 REDIS_PORT=16380 CORS_ORIGINS=http://127.0.0.1:5173 JWT_SECRET=weaver-local-browser-secret-1234567890 JWT_REFRESH_SECRET=weaver-local-refresh-secret-1234567890 pnpm --filter @weaver/api dev
```

Complete builds and source edits before starting the browser run, since the API watcher restarts on either change. Run the API integration and browser suites separately, or give each its own Postgres and Redis services; queue workers share Redis job names even when their databases differ.

The password reset scenario reads email from a local Mailpit and needs the worker to send it. Without `PLAYWRIGHT_MAILPIT_URL` it is skipped. To include it, start Mailpit, add these mail settings to the API command above, and start the built worker with the same database, Redis, and mail settings:

```sh
docker run --rm -d --name weaver-e2e-mailpit -p 127.0.0.1:11025:1025 -p 127.0.0.1:18025:8025 axllent/mailpit:v1.21
```

```sh
SMTP_HOST=127.0.0.1 SMTP_PORT=11025 SMTP_FROM=weaver@example.invalid SMTP_ALLOW_PRIVATE_HOST=true WEB_APP_URL=http://127.0.0.1:5173
```

```sh
NODE_ENV=development DATABASE_HOST=127.0.0.1 DATABASE_PORT=15432 REDIS_HOST=127.0.0.1 REDIS_PORT=16380 SMTP_HOST=127.0.0.1 SMTP_PORT=11025 SMTP_FROM=weaver@example.invalid SMTP_ALLOW_PRIVATE_HOST=true node apps/worker/dist/main.js
```

Then set `PLAYWRIGHT_MAILPIT_URL=http://127.0.0.1:18025` for the browser run. A client address may request 5 reset links per 15 minutes, so a second full run within that window needs fresh Redis.

The Playwright config starts Vite when needed. In another terminal:

```sh
pnpm --filter @weaver/web test:e2e
```

For API integration tests against the same disposable services:

```sh
TZ=UTC WEAVER_E2E_DATABASE_PORT=15432 WEAVER_E2E_REDIS_PORT=16380 pnpm --filter @weaver/api test:e2e --runInBand --forceExit
```

Each API spec starts its app with `await app.listen(0, '127.0.0.1')` before sending requests. Supertest gives an unbound app a port on every interface but sends to `127.0.0.1`, so on macOS another process listening on `127.0.0.1` at that port, such as a Docker port forward, can receive the request and fail the suite with a stray `404` or `401`. Both API Jest configs map `supertest` to `apps/api/test/loopback-supertest.js`, which throws when a spec sends a request to an app that is not bound to loopback.

The browser fixture honors the API's `429` retry interval during account setup. A full run can pause briefly when the local unauthenticated rate limit is reached. Set `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_API_URL` only when your local ports differ; the fixture still requires a loopback hostname. The test report and traces live in ignored `apps/web/test-results/`.

Stop the disposable services after testing:

```sh
docker stop weaver-e2e-pg weaver-e2e-redis weaver-e2e-mailpit
```

## Coverage

Browser scenarios cover account registration, login and logout, password reset from an emailed link (single use, no token in Referer headers, no email for an unknown address), invitations for new and existing users, organization switching and role isolation, private project membership, client directory and people-picker privacy with full agency access, project and issue creation and edits, comments, time entries, WQL search and saved filters, workflow editing, board drag persistence, sprint lifecycle, live updates between two sessions (including a board, sprint changes, logged time, and a dropped connection), plugin gates, administration forms, route rendering, and a phone-sized core journey. API integration tests provide deeper authorization, tenant isolation, realtime, import, plugin, and webhook checks.

For the October 14 readiness findings and remaining pilot limits, see [READINESS-2026-10-14.md](./READINESS-2026-10-14.md).
