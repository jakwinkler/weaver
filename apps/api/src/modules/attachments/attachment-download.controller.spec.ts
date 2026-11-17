import { PassThrough } from 'node:stream';
import { AttachmentDownloadController } from './attachment-download.controller';
import { tenantStorage } from '../../core/tenant/tenant.context';

it('terminates an ongoing download when the five-second check detects access revocation', async () => {
  jest.useFakeTimers();
  const stream = new PassThrough();
  const response = Object.assign(new PassThrough(), {
    setHeader: jest.fn(),
    getHeader: () => 'attachment; filename="fixture.mp4"',
    attachment: jest.fn(),
    set: jest.fn(),
  });
  response.resume();
  const check = jest.fn().mockRejectedValue(new Error('revoked'));
  const controller = new AttachmentDownloadController(
    {
      findById: async () => ({
        storageKey: 'file',
        filename: 'fixture.mp4',
        mimeType: 'video/mp4',
        size: '1024',
      }),
      getStream: async () => stream,
    } as never,
    { getEntityManager: async () => ({ query: async () => [{ role: 'viewer' }] }) } as never,
    { assertAttachmentId: check } as never,
  );
  try {
    await tenantStorage.run({ tenantId: 'tenant', schemaName: 'tenant_test' }, async () => {
      const pending = controller.download(
        'attachment',
        response as never,
        { method: 'GET' } as never,
        undefined,
        { userId: 'viewer', tenantId: 'tenant', role: 'viewer', email: '' },
      );
      const failed = expect(pending).rejects.toThrow('revoked');
      await jest.advanceTimersByTimeAsync(5000);
      await failed;
    });
    expect(stream.destroyed).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
    stream.destroy();
    response.destroy();
  }
});
