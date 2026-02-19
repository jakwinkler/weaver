import { tenantStorage, getTenantContext, requireTenantContext } from './tenant.context';

describe('TenantContext', () => {
  it('should return undefined outside of storage context', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('should return tenant info inside storage context', (done) => {
    const tenantInfo = { tenantId: 'test-id', schemaName: 'tenant_test' };

    tenantStorage.run(tenantInfo, () => {
      const ctx = getTenantContext();
      expect(ctx).toEqual(tenantInfo);
      expect(ctx!.tenantId).toBe('test-id');
      expect(ctx!.schemaName).toBe('tenant_test');
      done();
    });
  });

  it('should throw when requireTenantContext is called outside context', () => {
    expect(() => requireTenantContext()).toThrow('Tenant context is not available');
  });

  it('should return tenant info from requireTenantContext inside context', (done) => {
    const tenantInfo = { tenantId: 'req-id', schemaName: 'tenant_req' };

    tenantStorage.run(tenantInfo, () => {
      const ctx = requireTenantContext();
      expect(ctx.tenantId).toBe('req-id');
      done();
    });
  });

  it('should isolate contexts between async operations', async () => {
    const results: string[] = [];

    const task1 = new Promise<void>((resolve) => {
      tenantStorage.run({ tenantId: 'a', schemaName: 'tenant_a' }, () => {
        setTimeout(() => {
          results.push(getTenantContext()!.tenantId);
          resolve();
        }, 10);
      });
    });

    const task2 = new Promise<void>((resolve) => {
      tenantStorage.run({ tenantId: 'b', schemaName: 'tenant_b' }, () => {
        setTimeout(() => {
          results.push(getTenantContext()!.tenantId);
          resolve();
        }, 5);
      });
    });

    await Promise.all([task1, task2]);

    expect(results).toContain('a');
    expect(results).toContain('b');
  });
});
