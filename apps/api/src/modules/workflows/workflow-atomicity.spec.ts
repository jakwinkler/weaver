import { WorkflowsService } from './workflows.service';
import { WorkflowEntity } from '@weaver/db';

describe('initial workflow status changes', () => {
  it.each(['addStatus', 'updateStatus'])(
    '%s preserves the initial flag after a failed save',
    async (method) => {
      let initial = true;
      const qb: any = {
        update: () => qb,
        set: () => qb,
        where: () => qb,
        execute: async () => {
          initial = false;
        },
      };
      const statusRepo = {
        findOneBy: async () => ({ id: 'status', workflowId: 'workflow', isInitial: false }),
        createQueryBuilder: () => qb,
        create: (x: unknown) => x,
        save: async () => {
          throw new Error('database write failed');
        },
      };
      const manager = {
        query: jest.fn(),
        getRepository: (entity: unknown) =>
          entity === WorkflowEntity ? { findOneBy: async () => ({ id: 'workflow' }) } : statusRepo,
      };
      const connections = {
        getEntityManager: async () => manager,
        runInTenantTransaction: async (fn: (em: any) => Promise<unknown>) => {
          const before = initial;
          try {
            return await fn(manager);
          } catch (error) {
            initial = before;
            throw error;
          }
        },
      };
      const service = new WorkflowsService(connections as any, {} as any, {} as any);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 'workflow' } as any);
      const promise =
        method === 'addStatus'
          ? service.addStatus('workflow', { isInitial: true } as any)
          : service.updateStatus('workflow', 'status', { isInitial: true });
      await expect(promise).rejects.toThrow('database write failed');
      expect(initial).toBe(true);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        expect.any(Array),
      );
    },
  );
});
