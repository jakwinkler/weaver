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

function resolveCompose(t, credentials) {
  const directory = mkdtempSync(join(tmpdir(), 'weaver-oauth-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const envFile = join(directory, '.env');
  const settings = {
    DATABASE_PASSWORD: 'test-database-password',
    REDIS_PASSWORD: 'test-redis-password',
    JWT_SECRET: 'test-jwt-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    ...credentials,
  };
  writeFileSync(
    envFile,
    Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n'),
    { mode: 0o600 },
  );
  const env = { ...process.env };
  for (const key of [...Object.keys(settings), ...Object.keys(oauthCredentials)]) {
    delete env[key];
  }
  return JSON.parse(execFileSync('docker', [
    'compose', '--env-file', envFile, '-f', join(__dirname, 'compose.yaml'),
    'config', '--format', 'json',
  ], { env, encoding: 'utf8' }));
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
  assert.equal(services.api.environment.API_PUBLIC_URL, 'https://weaver.usercore.com');
  assert.equal(services.api.environment.API_PREFIX, 'api/v1');
  assert.equal(services.api.environment.WEB_URL, 'https://weaver.usercore.com');
});

test('password-only deployments can still resolve without OAuth credentials', (t) => {
  const { services } = resolveCompose(t, {});
  for (const key of Object.keys(oauthCredentials)) {
    assert.ok(!services.api.environment[key]);
  }
});
