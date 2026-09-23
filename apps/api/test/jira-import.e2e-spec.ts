import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard, JwtAuthGuard } from '../src/core/auth';
import { tenantStorage, TenantConnectionProvider } from '../src/core/tenant';
import { ImportController } from '../src/modules/import/import.controller';
import { ImportQueueService } from '../src/modules/import/import-queue.service';
import { ImportService } from '../src/modules/import/import.service';
import { JiraClientService } from '../src/modules/import/jira-client.service';

describe('Jira import endpoints (e2e)', () => {
  let app: INestApplication;
  const queued: any[] = [];
  const saved: any[] = [];

  beforeAll(async () => {
    const repository = {
      create: (value: any) => value,
      save: async (value: any) => {
        const job = {
          id: value.id ?? '11111111-1111-4111-8111-111111111111',
          createdAt: value.createdAt ?? new Date('2026-08-29T12:00:00Z'),
          updatedAt: value.updatedAt ?? new Date('2026-08-29T12:00:00Z'),
          ...value,
        };
        saved.push(job);
        return job;
      },
      findOneBy: async ({ id }: { id: string }) => saved.find((job) => job.id === id) ?? null,
    };
    const manager = { getRepository: () => repository, query: async () => [] };
    const moduleRef = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [
        ImportService,
        {
          provide: TenantConnectionProvider,
          useValue: { getEntityManager: async () => manager },
        },
        {
          provide: JiraClientService,
          useValue: {
            testConnection: async () => undefined,
            getProjects: async () => [
              { id: '1', key: 'ONE', name: 'One' },
              { id: '2', key: 'TWO', name: 'Two' },
            ],
          },
        },
        {
          provide: ImportQueueService,
          useValue: {
            enqueue: async (data: any) => queued.push(data),
            cancel: async () => undefined,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = {
            userId: '22222222-2222-4222-8222-222222222222',
            tenantId: '33333333-3333-4333-8333-333333333333',
            email: 'owner@example.com',
            role: 'owner',
          };
          return true;
        },
      })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((_req, _res, next) => {
      tenantStorage.run(
        {
          tenantId: '33333333-3333-4333-8333-333333333333',
          schemaName: 'tenant_jira_import_test',
        },
        next,
      );
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid config and creates a queued job for only selected projects', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/import/jira/start')
      .send({
        config: {
          source: 'jira_server',
          baseUrl: 'https://jira.example.com',
          auth: { type: 'api_token', token: 'test-token' },
        },
        projectKeys: ['ONE'],
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      selectedProjectKeys: ['ONE'],
    });
    expect(queued.at(-1)).toMatchObject({
      importJobId: response.body.id,
      schemaName: 'tenant_jira_import_test',
      projectKeys: ['ONE'],
    });
  });

  it('rejects an inaccessible selected Jira project', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/import/jira/start')
      .send({
        config: {
          source: 'jira_server',
          baseUrl: 'https://jira.example.com',
          auth: { type: 'api_token', token: 'test-token' },
        },
        projectKeys: ['MISSING'],
      })
      .expect(400);

    expect(response.body.message).toContain('Selected Jira projects are not accessible');
  });
});
