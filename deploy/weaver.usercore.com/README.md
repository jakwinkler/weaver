# weaver.usercore.com live-testing deployment

This deployment runs Weaver in an isolated Docker Compose project behind Caddy.
Only the web container is published, on host loopback port 3400. Postgres and
Redis are private to the Compose network, and their data plus uploaded files use
persistent Docker volumes.

The API intentionally runs with `NODE_ENV=development` because Weaver does not
yet have production migrations and uses TypeORM synchronization to initialize
its public and tenant schemas. Treat this as a live-testing environment, not a
production deployment. Back up the database volume before upgrades and replace
synchronization with reviewed migrations before production use.

The host keeps generated secrets in `/opt/weaver/shared/.env` with mode 0600.
Caddy terminates HTTPS at `weaver.usercore.com`, serves the deployment-specific
`robots.txt`, and applies an `X-Robots-Tag` noindex header to every response.

The deployed source revision is recorded in `/opt/weaver/DEPLOYED_REVISION`.
