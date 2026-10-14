# Local functional browser suite

These Playwright tests create accounts, organizations, projects, and issues. They refuse non-local web or API hostnames. Run them only against disposable local Postgres and Redis services. The tests use random organization slugs and do not clean up their data; remove the disposable containers after the run.

## Start the local services

From the repository root, install dependencies and build the shared and database packages. Install Playwright Chromium once if it is not present.

```sh
pnpm install --frozen-lockfile
pnpm --filter @weaver/shared build
pnpm --filter @weaver/db build
pnpm --filter @weaver/web exec playwright install chromium
docker run --rm -d --name weaver-e2e-pg -e POSTGRES_USER=weaver -e POSTGRES_PASSWORD=weaver_dev -e POSTGRES_DB=weaver -p 127.0.0.1:15432:5432 postgres:16-alpine
docker run --rm -d --name weaver-e2e-redis -p 127.0.0.1:16380:6379 redis:7-alpine
```

Set `JWT_SECRET` and `JWT_REFRESH_SECRET` through your local environment or an ignored `.env` file. Start the API in one terminal:

```sh
DATABASE_HOST=127.0.0.1 DATABASE_PORT=15432 REDIS_HOST=127.0.0.1 REDIS_PORT=16380 CORS_ORIGINS=http://127.0.0.1:5173 pnpm --filter @weaver/api dev
```

The Playwright config starts Vite when needed. In another terminal:

```sh
pnpm --filter @weaver/web test:e2e
```

For API integration tests against the same disposable services:

```sh
DATABASE_HOST=127.0.0.1 DATABASE_PORT=15432 REDIS_HOST=127.0.0.1 REDIS_PORT=16380 pnpm --filter @weaver/api test:e2e --runInBand
```

The browser fixture honors the API's `429` retry interval during account setup. A full run can pause briefly when the local unauthenticated rate limit is reached. Set `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_API_URL` only when your local ports differ; the fixture still requires a loopback hostname. The test report and traces live in ignored `apps/web/test-results/`.

Stop the disposable services after testing:

```sh
docker stop weaver-e2e-pg weaver-e2e-redis
```

## Coverage

Browser scenarios cover account registration, login and logout, invitations for new and existing users, organization switching and role isolation, private project membership, project and issue creation and edits, comments, time entries, WQL search and saved filters, workflow editing, board drag persistence, sprint lifecycle, plugin gates, administration forms, route rendering, and a phone-sized core journey. API integration tests provide deeper authorization, tenant isolation, realtime, import, plugin, and webhook checks.

For the October 14 readiness findings and remaining pilot limits, see [READINESS-2026-10-14.md](./READINESS-2026-10-14.md).
