const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = (name) => readFileSync(resolve(__dirname, '..', name), 'utf8');

test('every shipped proxy permits multipart overhead above the 10 MiB file limit', () => {
  assert.match(read('docker/nginx.conf'), /client_max_body_size\s+11m;/);
  for (const file of ['k8s/base/ingress.yaml', 'k8s/helm/weaver/templates/ingress.yaml']) {
    assert.match(read(file), /nginx.ingress.kubernetes.io\/proxy-body-size: "11m"/);
  }
});
test('SPA framing protection preserves public form embedding and staged CSP', () => {
  const nginx = read('docker/nginx.conf');
  assert.match(nginx, /map \$request_uri \$weaver_frame_options/);
  assert.match(nginx, /X-Content-Type-Options "nosniff" always/);
  assert.match(nginx, /Content-Security-Policy-Report-Only/);
  assert.match(nginx, /Strict-Transport-Security/);
});
test('password reset and invitation links stay out of access logs and Referer headers', () => {
  const nginx = read('docker/nginx.conf');
  const accessLog = nginx.match(/map \$request_uri \$weaver_access_log \{[^}]*\}/)?.[0] ?? '';
  const referrerPolicy = nginx.match(/map \$request_uri \$weaver_referrer_policy \{[^}]*\}/)?.[0] ?? '';
  for (const path of ['\\/reset-password\\/', '\\/invite\\/', '\\/api\\/v1\\/auth\\/invitations\\/']) {
    assert.match(accessLog, new RegExp(`~\\^${path} 0;`), path);
    assert.match(referrerPolicy, new RegExp(`~\\^${path} "no-referrer";`), path);
  }
  assert.match(nginx, /access_log \S+ main if=\$weaver_access_log;/);
  assert.match(nginx, /add_header Referrer-Policy \$weaver_referrer_policy always;/);
});
test('both Compose deployments give the API and worker the installation mail server', () => {
  const template = read('deploy/compose/compose.yaml');
  assert.match(template, /x-smtp-environment: &smtp-environment/);
  assert.equal(template.match(/<<: \[[^\]]*\*smtp-environment\]/g)?.length, 2);
  const compose = read('docker/docker-compose.yml');
  assert.equal(compose.match(/SMTP_HOST: \$\{SMTP_HOST:-\}/g)?.length, 2);
  assert.match(compose, /WEB_APP_URL: \$\{WEB_APP_URL:-\$\{WEB_URL:-http:\/\/localhost\}\}/);
});
test('production Compose passes the trusted plugin allowlist to the API', () => {
  for (const file of ['docker/docker-compose.yml', 'deploy/compose/compose.yaml']) {
    assert.match(read(file), /WEAVER_TRUSTED_PLUGINS: \$\{WEAVER_TRUSTED_PLUGINS:-\}/, file);
  }
});
test('development data services bind only to loopback', () => {
  const compose = read('docker/docker-compose.dev.yml');
  assert.match(compose, /127\.0\.0\.1:\$\{DATABASE_PORT/);
  assert.match(compose, /127\.0\.0\.1:\$\{REDIS_PORT/);
});

test(
  'running Nginx protects the app and preserves public-form URL variants',
  {
    skip: !process.env.WEAVER_HTTP_TEST_URL,
  },
  async () => {
    for (const [path, embedded] of [
      ['/login', false],
      ['/public/test/forms/test', true],
      ['/public/test/forms/test/', true],
      ['/public/test/forms/test/?embed=1', true],
      ['/public/test/forms/test/private', false],
    ]) {
      const response = await fetch(new URL(path, process.env.WEAVER_HTTP_TEST_URL));
      assert.equal(response.headers.get('x-frame-options'), embedded ? null : 'DENY', path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(
        response.headers.get('content-security-policy').includes('frame-ancestors'),
        !embedded,
        path,
      );
    }
    for (const [path, policy] of [
      ['/login', 'strict-origin-when-cross-origin'],
      [`/reset-password/${'a'.repeat(96)}`, 'no-referrer'],
      [`/invite/${'a'.repeat(64)}`, 'no-referrer'],
    ]) {
      const response = await fetch(new URL(path, process.env.WEAVER_HTTP_TEST_URL));
      assert.equal(response.headers.get('referrer-policy'), policy, path);
    }
  },
);
