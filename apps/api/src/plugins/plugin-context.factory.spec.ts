import { PluginContextFactory } from './plugin-context.factory';
import { tenantStorage } from '../core/tenant';

describe('PluginContextFactory', () => {
  it('rejects untrusted issue update keys before constructing SQL', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const tenantConnections = {
      getEntityManager: jest.fn().mockResolvedValue({ query }),
    };
    const factory = new PluginContextFactory(
      tenantConnections as never,
      { emit: jest.fn() } as never,
    );

    await tenantStorage.run(
      { tenantId: '7ae66f2a-8358-47fe-82c4-d9d915b26122', schemaName: 'tenant_safe' },
      async () => {
        const context = await factory.create('@weaver/security-test', {});

        await expect(
          context.api.issues.update('SAFE-1', {
            'summary" = NULL WHERE true; --': 'injected',
          }),
        ).rejects.toThrow('Unsupported issue update field');
      },
    );

    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('summary" = NULL'),
      expect.anything(),
    );
  });
});
