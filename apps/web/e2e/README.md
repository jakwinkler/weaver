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

The Playwright config starts Vite when needed. In another terminal:

```sh
pnpm --filter @weaver/web test:e2e
```

For API integration tests against the same disposable services:

```sh
TZ=UTC WEAVER_E2E_DATABASE_PORT=15432 WEAVER_E2E_REDIS_PORT=16380 pnpm --filter @weaver/api test:e2e --runInBand --forceExit
```

The browser fixture honors the API's `429` retry interval during account setup. A full run can pause briefly when the local unauthenticated rate limit is reached. Set `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_API_URL` only when your local ports differ; the fixture still requires a loopback hostname. The test report and traces live in ignored `apps/web/test-results/`.

Stop the disposable services after testing:

```sh
docker stop weaver-e2e-pg weaver-e2e-redis
```

## Coverage

Browser scenarios cover account registration, login and logout, invitations for new and existing users, organization switching and role isolation, private project membership, client directory and people-picker privacy with full agency access, project and issue creation and edits, comments, time entries, WQL search and saved filters, workflow editing, board drag persistence, sprint lifecycle, plugin gates, administration forms, route rendering, and a phone-sized core journey. API integration tests provide deeper authorization, tenant isolation, realtime, import, plugin, and webhook checks.

For the October 14 readiness findings and remaining pilot limits, see [READINESS-2026-10-14.md](./READINESS-2026-10-14.md).
