const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  sealImportJob,
  openImportJob,
  LocalStorageAdapter,
  pinnedLookup,
  readLimitedResponseBuffer,
  assertProductionDataCredentials,
} = require('../dist');

test('API and worker credential checks reject unknown modes and preserve explicit development/test modes', () => {
  for (const NODE_ENV of [undefined, '', 'prod', 'staging', 'Production']) {
    assert.throws(() => assertProductionDataCredentials({ NODE_ENV }), /NODE_ENV/);
  }
  for (const NODE_ENV of ['development', 'test']) {
    assert.doesNotThrow(() => assertProductionDataCredentials({ NODE_ENV }));
  }
  assert.throws(() => assertProductionDataCredentials({ NODE_ENV: 'production' }), /DATABASE_PASSWORD/);
});

test('encrypted jobs are bound to a tenant and job and reject tampering', () => {
  const key = randomBytes(32).toString('base64');
  const input = { credentials: { token: 'synthetic-review-token' } };
  const sealed = sealImportJob(input, 'tenant-a:job-1', key);
  assert.deepEqual(openImportJob(sealed, 'tenant-a:job-1', key), input);
  assert.ok(!Buffer.from(sealed, 'base64').includes(Buffer.from(input.credentials.token)));
  assert.throws(() => openImportJob(sealed, 'tenant-b:job-1', key));
  assert.throws(() => openImportJob(sealed, 'tenant-a:job-2', key));
  const corrupt = Buffer.from(sealed, 'base64');
  corrupt[30] ^= 1;
  assert.throws(() => openImportJob(corrupt.toString('base64'), 'tenant-a:job-1', key));
  assert.throws(() => sealImportJob(input, 'tenant-a:job-1', undefined));
});

test('API and worker local adapters can read the same object and reject traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'weaver-review-storage-'));
  const config = { get: () => directory };
  try {
    const api = new LocalStorageAdapter(config);
    const worker = new LocalStorageAdapter(config);
    await worker.put('test-object', Buffer.from('imported content'));
    assert.equal((await api.get('test-object')).toString(), 'imported content');
    await assert.rejects(worker.put('../escape', Buffer.from('x')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('pinned DNS lookup only returns the validated addresses', () => {
  const lookup = pinnedLookup([{ address: '8.8.8.8', family: 4 }]);
  lookup('attacker.example', { all: false }, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, '8.8.8.8');
    assert.equal(family, 4);
  });
});

test('response streams stop at the byte limit even without Content-Length', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(readLimitedResponseBuffer(response, 10), /size limit/);
  assert.equal(cancelled, true);
});
