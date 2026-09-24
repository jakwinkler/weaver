import { ProjectsService } from './projects.service';
import { ProjectEntity } from '@weaver/db';

it('rolls back the project if provisioning its defaults fails', async () => {
  let saved = false;
  const projectRepo = {
    findOneBy: async () => null,
    create: (dto: unknown) => dto,
    save: async (dto: any) => {
      saved = true;
      return { ...dto, id: 'project' };
    },
  };
  const memberRepo = { create: (dto: unknown) => dto, save: async () => undefined };
  const manager = {
    query: jest.fn(),
    getRepository: (entity: unknown) => (entity === ProjectEntity ? projectRepo : memberRepo),
  };
  const connections = {
    getEntityManager: async () => manager,
    runInTenantTransaction: async (fn: any) => {
      try {
        return await fn(manager);
      } catch (error) {
        saved = false;
        throw error;
      }
    },
  };
  const service = new ProjectsService(
    connections as any,
    { getDefaultWorkflow: async () => ({ id: 'workflow' }) } as any,
    { emit: jest.fn() } as any,
    {
      seedDefaults: async () => {
        throw new Error('defaults failed');
      },
    } as any,
    {} as any,
  );
  await expect(service.create({ key: 'TEST', name: 'Test' }, 'user')).rejects.toThrow(
    'defaults failed',
  );
  expect(saved).toBe(false);
});
