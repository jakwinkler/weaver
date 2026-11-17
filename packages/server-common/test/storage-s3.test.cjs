const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListMultipartUploadsCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { S3StorageAdapter, LocalStorageAdapter, hashStream } = require('../dist/storage');
const { mkdtemp, rm, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const endpoint = process.env.WEAVER_TEST_S3_ENDPOINT;
test(
  'real S3 multipart lifecycle, ranges, abort, orphan cleanup, and bounded memory',
  { skip: !endpoint, timeout: 180000 },
  async () => {
    assert.match(endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
    const bucket = `weaver-test-${randomUUID()}`;
    const settings = {
      S3_BUCKET: bucket,
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: 'true',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
    };
    const client = new S3Client({
      endpoint,
      region: settings.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const storage = new S3StorageAdapter({ get: (key) => settings[key] });
    const directory = await mkdtemp(join(tmpdir(), 'weaver-storage-bounds-'));
    const local = new LocalStorageAdapter({ get: () => directory });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    const measurements = [];
    try {
      for (const [driver, adapter] of [
        ['local', local],
        ['s3', storage],
      ]) {
        for (const size of [0, 100 * 1024 ** 2, 250 * 1024 ** 2, 512 * 1024 ** 2]) {
          const hash = createHash('sha256');
          const chunk = Buffer.alloc(65536, 42);
          let peak = process.memoryUsage().rss;
          const baseline = peak;
          const sample = setInterval(() => {
            peak = Math.max(peak, process.memoryUsage().rss);
          }, 5);
          async function* bytes() {
            for (let remaining = size; remaining > 0;) {
              const part = chunk.subarray(0, Math.min(remaining, chunk.length));
              remaining -= part.length;
              hash.update(part);
              yield part;
            }
          }
          try {
            await adapter.putStream('file', bytes());
            assert.deepEqual(await hashStream(await adapter.getStream('file')), {
              size,
              sha256: hash.digest('hex'),
            });
            if (size)
              assert.equal(
                (
                  await hashStream(
                    await adapter.getStream('file', { start: size - 99, end: size - 1 }),
                  )
                ).size,
                99,
              );
            measurements.push({ driver, bytes: size, baselineRss: baseline, peakRss: peak });
            assert.ok(
              peak - baseline < 200 * 1024 ** 2,
              'stream memory growth stays below 200 MiB',
            );
          } finally {
            clearInterval(sample);
            await adapter.delete('file');
          }
        }
        await assert.rejects(
          adapter.putStream(
            'interrupted',
            (async function* () {
              yield Buffer.alloc(9 * 1024 ** 2);
              throw new Error('interrupted');
            })(),
          ),
          /interrupted/,
        );
      }
      assert.deepEqual(await readdir(directory), []);
      assert.equal(
        (await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }))).Uploads?.length ??
          0,
        0,
      );
      await assert.rejects(
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'interrupted' })),
      );
      await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: 'orphan' }));
      await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: 'orphan-other' }));
      await storage.abortWrite('orphan');
      assert.deepEqual(
        (await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }))).Uploads.map(
          (u) => u.Key,
        ),
        ['orphan-other'],
      );
      await storage.abortWrite('orphan-other');
      console.log(JSON.stringify({ storageMeasurements: measurements }));
    } finally {
      await rm(directory, { recursive: true, force: true });
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
      client.destroy();
    }
  },
);
