import { describe, expect, it, vi } from 'vitest';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { attachWorkerLogging } from './worker-logging';

// Opt in only with the disposable Redis instance created for this test.
describe.skipIf(!process.env.WEAVER_WORKER_TEST_REDIS_PORT)('worker Redis recovery', () => {
  it('logs connection errors and processes jobs after Redis disconnects clients', async () => {
    const name = `weaver-recovery-${randomUUID()}`;
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.WEAVER_WORKER_TEST_REDIS_PORT),
      connectionName: name,
    };
    const admin = new Redis({ ...connection, connectionName: `${name}-admin` });
    const queue = new Queue(name, { connection });
    const worker = new Worker(name, async (job) => job.data.value, { connection });
    attachWorkerLogging(worker);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const complete = () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker did not recover')), 15_000);
        worker.once('completed', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    try {
      await worker.waitUntilReady();
      const first = complete();
      await queue.add('before', { value: 1 });
      await first;
      worker.emit('error', Object.assign(new Error('sensitive details'), { code: 'ECONNRESET' }));
      expect(log).toHaveBeenCalledWith(
        'Worker connection error',
        expect.objectContaining({ queue: name, code: 'ECONNRESET' }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive details');
      const clients = String(await admin.client('LIST'))
        .trim()
        .split('\n');
      const names = new Set([name, `bull:${Buffer.from(name).toString('base64')}`]);
      const ownedClients = clients
        .map((line) => Object.fromEntries(line.split(' ').map((part) => part.split('='))))
        .filter((client) => names.has(client.name));
      expect(ownedClients.length).toBeGreaterThan(0);
      for (const client of ownedClients) await admin.client('KILL', 'ID', client.id);
      const second = complete();
      await queue.add('after', { value: 2 });
      await second;
      expect(await queue.getCompletedCount()).toBe(2);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await admin.quit();
      log.mockRestore();
    }
  }, 25_000);
});
