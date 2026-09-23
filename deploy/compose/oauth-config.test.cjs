const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const oauthCredentials = {
  GOOGLE_CLIENT_ID: 'test-google-client',
  GOOGLE_CLIENT_SECRET: 'test-google-secret',
  GITHUB_CLIENT_ID: 'test-github-client',
  GITHUB_CLIENT_SECRET: 'test-github-secret',
};

function resolveCompose(t, credentials, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'weaver-oauth-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const envFile = join(directory, '.env');
  const settings = {
    COMPOSE_PROJECT_NAME: 'weaver-config-test',
    WEAVER_PUBLIC_URL: 'https://projects.example.test',
    DATABASE_PASSWORD: 'test-database-password',
    REDIS_PASSWORD: 'test-redis-password',
    JWT_SECRET: 'test-jwt-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    ...credentials,
    ...overrides,
  };
  writeFileSync(
    envFile,
    Object.entries(settings)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    { mode: 0o600 },
  );
  const env = { ...process.env };
  for (const key of [...Object.keys(settings), ...Object.keys(oauthCredentials)]) {
    delete env[key];
  }
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        envFile,
        '-f',
        join(__dirname, 'compose.yaml'),
        'config',
        '--format',
        'json',
      ],
      { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
}

test('host OAuth credentials reach only the API runtime', (t) => {
  const { services } = resolveCompose(t, oauthCredentials);
  for (const [key, value] of Object.entries(oauthCredentials)) {
    assert.equal(services.api.environment[key], value, `${key} must reach the API`);
    for (const service of ['web', 'worker', 'postgres', 'redis']) {
      assert.equal(services[service].environment?.[key], undefined);
    }
    assert.equal(services.api.build.args?.[key], undefined);
  }
  for (const key of ['API_PUBLIC_URL', 'WEB_URL', 'WEB_APP_URL', 'CORS_ORIGINS']) {
    assert.equal(services.api.environment[key], 'https://projects.example.test');
  }
  assert.equal(services.api.environment.API_PREFIX, 'api/v1');
});

test('password-only deployments can still resolve without OAuth credentials', (t) => {
  const { services } = resolveCompose(t, {});
  for (const key of Object.keys(oauthCredentials)) {
    assert.ok(!services.api.environment[key]);
  }
});

test('deployments require an explicit public origin', (t) => {
  assert.throws(() => resolveCompose(t, {}, { WEAVER_PUBLIC_URL: '' }), /WEAVER_PUBLIC_URL/);
});

test('deployments require an explicit project name to preserve volume identity', (t) => {
  assert.throws(() => resolveCompose(t, {}, { COMPOSE_PROJECT_NAME: '' }), /COMPOSE_PROJECT_NAME/);
});

test('existing project names and image pins survive configuration changes', (t) => {
  const config = resolveCompose(
    t,
    {},
    {
      COMPOSE_PROJECT_NAME: 'existing-installation',
      WEAVER_API_IMAGE: 'weaver-api:reviewed',
      WEAVER_WORKER_IMAGE: 'weaver-worker:reviewed',
      WEAVER_WEB_IMAGE: 'weaver-web:reviewed',
    },
  );
  assert.equal(config.name, 'existing-installation');
  assert.equal(config.volumes.postgres_data.name, 'existing-installation_postgres_data');
  assert.equal(config.volumes.redis_data.name, 'existing-installation_redis_data');
  assert.equal(config.volumes.uploads.name, 'existing-installation_uploads');
  for (const service of ['api', 'worker', 'web']) {
    assert.equal(config.services[service].image, `weaver-${service}:reviewed`);
  }
});
