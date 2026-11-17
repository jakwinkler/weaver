const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { LocalStorageAdapter, hashStream, parseByteRange } = require('../dist');

test('streams a large object, verifies its hash, and reads a byte range', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-stream-'));
  const storage = new LocalStorageAdapter({ get: () => directory });
  try {
    const chunk = Buffer.alloc(1024 * 1024, 42);
    const expected = createHash('sha256');
    async function* source() {
      for (let n = 0; n < 121; n++) {
        expected.update(chunk);
        yield chunk;
      }
    }
    await storage.putStream('object', source());
    const actual = await hashStream(await storage.getStream('object'));
    assert.equal(actual.size, 121 * 1024 * 1024);
    assert.equal(actual.sha256, expected.digest('hex'));
    const bytes = [];
    for await (const part of await storage.getStream('object', { start: 5, end: 12 }))
      bytes.push(part);
    assert.deepEqual(Buffer.concat(bytes), Buffer.alloc(8, 42));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('failed stream publishes no object and cleans its temporary file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'weaver-stream-'));
  const storage = new LocalStorageAdapter({ get: () => directory });
  try {
    async function* source() {
      yield Buffer.from('partial');
      throw new Error('interrupted');
    }
    await assert.rejects(storage.putStream('object', source()), /interrupted/);
    assert.deepEqual(await fs.readdir(directory), []);
    await assert.rejects(storage.putStream('../escape', source()), /escapes/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('single ranges support suffixes and reject invalid or multiple ranges', () => {
  assert.deepEqual(parseByteRange('bytes=5-12', 20), { start: 5, end: 12 });
  assert.deepEqual(parseByteRange('bytes=-4', 20), { start: 16, end: 19 });
  assert.deepEqual(parseByteRange('bytes=5-', 20), { start: 5, end: 19 });
  assert.deepEqual(parseByteRange('bytes=5-99', 20), { start: 5, end: 19 });
  for (const range of ['bytes=20-', 'bytes=9-2', 'bytes=0-1,3-4', 'bytes=-0', 'garbage'])
    assert.throws(() => parseByteRange(range, 20), /range/i);
});
