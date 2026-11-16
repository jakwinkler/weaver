import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter, hashStream } from '@weaver/server-common';
import { transferAttachment } from '@weaver/jira-import';

describe('large attachment transfer', () => {
  let directory: string;
  let storage: LocalStorageAdapter;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'weaver-transfer-'));
    storage = new LocalStorageAdapter({ get: () => directory } as never);
  });
  afterEach(async () => {
    delete process.env.JIRA_IMPORT_ATTACHMENT_MAX_BYTES;
    await rm(directory, { recursive: true, force: true });
  });
  function response(size: number) {
    return new Response(
      new ReadableStream({
        pull(controller) {
          if (!size) {
            controller.close();
            return;
          }
          const length = Math.min(size, 65536);
          size -= length;
          controller.enqueue(new Uint8Array(length).fill(42));
        },
      }),
    );
  }
  it.each([220230420, 142769480, 126732504])(
    'imports and verifies the EPD-sized %i byte fixture',
    async (size) => {
      const result = await transferAttachment(async () => response(size), storage, 'file', size);
      expect(result.size).toBe(size);
      expect(await hashStream(await storage.getStream('file'))).toEqual(result);
    },
  );
  it('rejects oversized metadata before making a network request', async () => {
    process.env.JIRA_IMPORT_ATTACHMENT_MAX_BYTES = '100';
    const fetcher = jest.fn();
    await expect(transferAttachment(fetcher, storage, 'file', 101)).rejects.toMatchObject({
      code: 'size_limit',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('aborts a stalled response reader and removes the temporary object', async () => {
    process.env.JIRA_IMPORT_ATTACHMENT_IDLE_TIMEOUT_MS = '10';
    const cancel = jest.fn();
    try {
      await expect(
        transferAttachment(
          async () => new Response(new ReadableStream({ cancel })),
          storage,
          'file',
          1,
        ),
      ).rejects.toMatchObject({ code: 'timeout' });
      expect(cancel).toHaveBeenCalledTimes(3);
      expect(await readdir(directory)).toEqual([]);
    } finally {
      delete process.env.JIRA_IMPORT_ATTACHMENT_IDLE_TIMEOUT_MS;
    }
  }, 5000);
  it('enforces the actual size when no length is provided and publishes no partial file', async () => {
    process.env.JIRA_IMPORT_ATTACHMENT_MAX_BYTES = '100';
    await expect(
      transferAttachment(async () => response(101), storage, 'file'),
    ).rejects.toMatchObject({ code: 'size_limit' });
    expect(await readdir(directory)).toEqual([]);
  });
  it('rejects truncated bytes without retrying or publishing', async () => {
    const fetcher = jest.fn(async () => response(99));
    await expect(transferAttachment(fetcher, storage, 'file', 100)).rejects.toMatchObject({
      code: 'integrity',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await readdir(directory)).toEqual([]);
  });
  it('retries throttling, never retries a permission denial, and hides upstream bodies', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        new Response('secret', { status: 429, headers: { 'retry-after': '0' } }),
      )
      .mockResolvedValueOnce(response(3));
    await expect(transferAttachment(fetcher, storage, 'file', 3)).resolves.toMatchObject({
      size: 3,
    });
    const forbidden = jest.fn(async () => new Response('secret', { status: 403 }));
    await expect(transferAttachment(forbidden, storage, 'other', 3)).rejects.toThrow(
      'Jira attachment download failed (403)',
    );
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
  it('accepts an empty file and the exact limit', async () => {
    process.env.JIRA_IMPORT_ATTACHMENT_MAX_BYTES = '100';
    expect((await transferAttachment(async () => response(0), storage, 'empty', 0)).size).toBe(0);
    expect((await transferAttachment(async () => response(100), storage, 'exact', 100)).size).toBe(
      100,
    );
  });
  it('cancels a blocked reader without retries or a published object', async () => {
    let checks = 0;
    const cancelled = new Error('Cancelled by administrator');
    const fetcher = jest.fn(async () => new Response(new ReadableStream()));
    await expect(
      transferAttachment(fetcher, storage, 'file', 1, async () => {
        if (++checks > 1) throw cancelled;
      }),
    ).rejects.toBe(cancelled);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await readdir(directory)).toEqual([]);
  });
});
