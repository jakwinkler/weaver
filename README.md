# Weaver

Weaver is an open-source project management application with issues, boards,
workflows, and a plugin system. The monorepo contains a NestJS API, React web
application, background worker, shared packages, and plugins. It is licensed
under the [MIT license](LICENSE).

## Development

Use Node.js 22, pnpm 9.15.4, and Docker with Compose. From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose --env-file .env -f docker/docker-compose.dev.yml up -d
pnpm build
pnpm dev
```

Review `.env` before starting. The example uses local development credentials;
keep development services on a trusted workstation. Development mode permits
TypeORM schema synchronization, so use a dedicated development database.

## Documentation

- [Compose deployment template](deploy/compose/README.md)
- [Google and GitHub sign-in](docs/wiki/OAuth-Sign-In.md)
- [Plugin development](docs/plugin-development.md)
- [Plugin API reference](docs/plugin-api-reference.md)
- [Roadmap](docs/roadmap/README.md)
- [Repository hygiene and secret scanning](docs/security/repository-hygiene.md)

Deployment templates require environment-specific configuration and reviewed
database preparation. Keep host inventories, credentials, backups, and generated
migration plans in private operational records.
