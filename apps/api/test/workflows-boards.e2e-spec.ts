import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Workflows, Boards, Sprints, Comments, Activity (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'wf-test@example.com',
        password: 'password123',
        displayName: 'Workflow Tester',
        orgName: 'WF Test Org',
        orgSlug: 'wf-test-org',
      });

    accessToken = res.body.accessToken;
    tenantId = res.body.tenantId;
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_wf_test_org" CASCADE`);
    await dataSource.query(`DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'wf-test-org')`);
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'wf-test-org'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'wf-test@example.com'`);
    await connections.closeAll();
    await app.close();
  });

  const authedRequest = () => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
  });

  describe('Workflows CRUD', () => {
    let workflowId: string;

    it('GET /workflows - should list workflows (includes seeded default)', async () => {
      const res = await authedRequest().get('/api/v1/workflows').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const defaultWf = res.body.find((w: any) => w.isDefault);
      expect(defaultWf).toBeDefined();
    });

    it('POST /workflows - should create a custom workflow', async () => {
      const res = await authedRequest()
        .post('/api/v1/workflows')
        .send({ name: 'Custom Workflow' })
        .expect(201);

      expect(res.body.name).toBe('Custom Workflow');
      expect(res.body.isDefault).toBe(false);
      workflowId = res.body.id;
    });

    it('GET /workflows/:id - should get workflow with statuses and transitions', async () => {
      const res = await authedRequest().get(`/api/v1/workflows/${workflowId}`).expect(200);
      expect(res.body.name).toBe('Custom Workflow');
      expect(res.body.statuses).toBeDefined();
      expect(res.body.transitions).toBeDefined();
    });

    it('PATCH /workflows/:id - should update workflow', async () => {
      const res = await authedRequest()
        .patch(`/api/v1/workflows/${workflowId}`)
        .send({ name: 'Updated Custom Workflow' })
        .expect(200);
      expect(res.body.name).toBe('Updated Custom Workflow');
    });

    describe('Workflow Statuses', () => {
      let statusOpenId: string;
      let statusClosedId: string;

      it('POST /workflows/:id/statuses - should add statuses', async () => {
        const open = await authedRequest()
          .post(`/api/v1/workflows/${workflowId}/statuses`)
          .send({ name: 'Open', category: 'todo', color: '#3B82F6', isInitial: true, position: 0 })
          .expect(201);
        statusOpenId = open.body.id;
        expect(open.body.isInitial).toBe(true);

        const closed = await authedRequest()
          .post(`/api/v1/workflows/${workflowId}/statuses`)
          .send({ name: 'Closed', category: 'done', color: '#10B981', isTerminal: true, position: 1 })
          .expect(201);
        statusClosedId = closed.body.id;
      });

      it('PATCH /workflows/:id/statuses/:statusId - should update status', async () => {
        const res = await authedRequest()
          .patch(`/api/v1/workflows/${workflowId}/statuses/${statusOpenId}`)
          .send({ color: '#2563EB' })
          .expect(200);
        expect(res.body.color).toBe('#2563EB');
      });

      describe('Workflow Transitions', () => {
        let transitionId: string;

        it('POST /workflows/:id/transitions - should add transition', async () => {
          const res = await authedRequest()
            .post(`/api/v1/workflows/${workflowId}/transitions`)
            .send({
              fromStatusId: statusOpenId,
              toStatusId: statusClosedId,
              name: 'Close Issue',
            })
            .expect(201);
          transitionId = res.body.id;
          expect(res.body.name).toBe('Close Issue');
        });

        it('should reject transition with invalid status IDs', async () => {
          await authedRequest()
            .post(`/api/v1/workflows/${workflowId}/transitions`)
            .send({
              fromStatusId: '00000000-0000-0000-0000-000000000000',
              toStatusId: statusClosedId,
              name: 'Invalid',
            })
            .expect(400);
        });

        it('rejects workflow rules whose evaluators are not registered', async () => {
          await authedRequest()
            .post(`/api/v1/workflows/${workflowId}/transitions`)
            .send({
              fromStatusId: statusOpenId,
              toStatusId: statusClosedId,
              name: 'Latent runtime failure',
              conditions: [{ type: 'missing-evaluator', params: {} }],
            })
            .expect(400);
        });

        it('GET /workflows/:id/transitions/available/:statusId - should return available transitions', async () => {
          const res = await authedRequest()
            .get(`/api/v1/workflows/${workflowId}/transitions/available/${statusOpenId}`)
            .expect(200);
          expect(res.body.length).toBe(1);
          expect(res.body[0].toStatus.name).toBe('Closed');
        });

        it('DELETE /workflows/:id/transitions/:transitionId - should delete transition', async () => {
          await authedRequest()
            .delete(`/api/v1/workflows/${workflowId}/transitions/${transitionId}`)
            .expect(204);
        });
      });

      it('DELETE /workflows/:id/statuses/:statusId - should delete status', async () => {
        await authedRequest()
          .delete(`/api/v1/workflows/${workflowId}/statuses/${statusClosedId}`)
          .expect(204);
      });
    });

    it('DELETE /workflows/:id - should delete workflow', async () => {
      await authedRequest().delete(`/api/v1/workflows/${workflowId}`).expect(204);
    });
  });

  describe('Issue Types CRUD', () => {
    let issueTypeId: string;

    it('GET /issue-types - should list seeded issue types', async () => {
      const res = await authedRequest().get('/api/v1/issue-types').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(5); // Task, Bug, Story, Epic, Sub-task
    });

    it('POST /issue-types - should create custom issue type', async () => {
      const res = await authedRequest()
        .post('/api/v1/issue-types')
        .send({ name: 'Feature Request', slug: 'feature-request', isSubtask: false })
        .expect(201);
      issueTypeId = res.body.id;
      expect(res.body.name).toBe('Feature Request');
    });

    it('PATCH /issue-types/:id - should update issue type', async () => {
      const res = await authedRequest()
        .patch(`/api/v1/issue-types/${issueTypeId}`)
        .send({ name: 'Feature' })
        .expect(200);
      expect(res.body.name).toBe('Feature');
    });

    it('DELETE /issue-types/:id - should delete issue type', async () => {
      await authedRequest().delete(`/api/v1/issue-types/${issueTypeId}`).expect(204);
    });
  });

  describe('Projects, Issues, Boards, Sprints, Comments, Activity', () => {
    let projectKey: string;
    let projectId: string;
    let issueKey: string;
    let issueId: string;
    let boardId: string;
    let sprintId: string;
    let projectWorkflowId: string;
    let issueStatusId: string;

    beforeAll(async () => {
      // Create a project
      const projRes = await authedRequest()
        .post('/api/v1/projects')
        .send({ name: 'Board Test', key: 'BRD' })
        .expect(201);
      projectKey = projRes.body.key;
      projectId = projRes.body.id;
      projectWorkflowId = projRes.body.workflowId;

      // Create an issue
      const issueRes = await authedRequest()
        .post(`/api/v1/projects/${projectKey}/issues`)
        .send({ summary: 'Test issue for boards' })
        .expect(201);
      issueKey = issueRes.body.key;
      issueId = issueRes.body.id;
      issueStatusId = issueRes.body.statusId;
    });

    it('rolls back a status transition when another update field is invalid', async () => {
      const workflow = await authedRequest()
        .get(`/api/v1/workflows/${projectWorkflowId}`)
        .expect(200);
      const transition = workflow.body.transitions.find(
        (candidate: any) => candidate.fromStatusId === issueStatusId,
      );
      expect(transition).toBeDefined();

      const response = await authedRequest()
        .patch(`/api/v1/issues/${issueKey}`)
        .send({
          statusId: transition.toStatusId,
          parentId: '11111111-1111-4111-8111-111111111111',
        });
      expect(response.status).toBeGreaterThanOrEqual(400);

      const unchanged = await authedRequest()
        .get(`/api/v1/issues/${issueKey}`)
        .expect(200);
      expect(unchanged.body.statusId).toBe(issueStatusId);
    });

    it('rejects self-parenting and parent cycles', async () => {
      const selfResponse = await authedRequest()
        .patch(`/api/v1/issues/${issueKey}`)
        .send({ parentId: issueId });
      if (selfResponse.status < 400) {
        await authedRequest()
          .patch(`/api/v1/issues/${issueKey}`)
          .send({ parentId: null });
      }
      expect(selfResponse.status).toBe(400);

      const child = await authedRequest()
        .post(`/api/v1/projects/${projectKey}/issues`)
        .send({ summary: 'Hierarchy child', parentId: issueId })
        .expect(201);
      const cycleResponse = await authedRequest()
        .patch(`/api/v1/issues/${issueKey}`)
        .send({ parentId: child.body.id });
      if (cycleResponse.status < 400) {
        await authedRequest()
          .patch(`/api/v1/issues/${issueKey}`)
          .send({ parentId: null });
      }
      expect(cycleResponse.status).toBe(400);
    });

    describe('Boards', () => {
      it('POST /boards - should create a kanban board', async () => {
        const res = await authedRequest()
          .post(`/api/v1/boards?projectId=${projectId}`)
          .send({ name: 'Dev Board', type: 'kanban' })
          .expect(201);
        boardId = res.body.id;
        expect(res.body.type).toBe('kanban');
      });

      it('GET /boards - should list boards', async () => {
        const res = await authedRequest()
          .get(`/api/v1/boards?projectId=${projectId}`)
          .expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });

      it('GET /boards/:id - should get board by id', async () => {
        const res = await authedRequest().get(`/api/v1/boards/${boardId}`).expect(200);
        expect(res.body.name).toBe('Dev Board');
      });

      it('PATCH /boards/:id - should update board', async () => {
        const res = await authedRequest()
          .patch(`/api/v1/boards/${boardId}`)
          .send({ name: 'Dev Board v2' })
          .expect(200);
        expect(res.body.name).toBe('Dev Board v2');
      });
    });

    describe('Sprints', () => {
      let secondSprintId: string;

      it('POST /sprints - should create a sprint', async () => {
        const res = await authedRequest()
          .post(`/api/v1/sprints?projectId=${projectId}`)
          .send({ name: 'Sprint 1' });
        expect(res.status).toBeLessThan(300);
        sprintId = res.body.id;
        expect(res.body.name).toBe('Sprint 1');
      });

      it('creates a second planned sprint', async () => {
        const res = await authedRequest()
          .post(`/api/v1/sprints?projectId=${projectId}`)
          .send({ name: 'Sprint 2' })
          .expect(201);
        secondSprintId = res.body.id;
      });

      it('GET /sprints - should list sprints', async () => {
        const res = await authedRequest()
          .get(`/api/v1/sprints?projectId=${projectId}`)
          .expect(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('rejects adding issues from another project', async () => {
        const otherProject = await authedRequest()
          .post('/api/v1/projects')
          .send({ name: 'Other Sprint Project', key: 'OSP' })
          .expect(201);
        const otherIssue = await authedRequest()
          .post(`/api/v1/projects/${otherProject.body.key}/issues`)
          .send({ summary: 'Issue from another project' })
          .expect(201);

        await authedRequest()
          .post(`/api/v1/sprints/${sprintId}/issues`)
          .send({ issueIds: [otherIssue.body.id] })
          .expect(400);
      });

      it('clears issue assignments when deleting a planned sprint', async () => {
        const temporarySprint = await authedRequest()
          .post(`/api/v1/sprints?projectId=${projectId}`)
          .send({ name: 'Temporary Sprint' })
          .expect(201);

        await authedRequest()
          .post(`/api/v1/sprints/${temporarySprint.body.id}/issues`)
          .send({ issueIds: [issueId] })
          .expect(201);
        await authedRequest().delete(`/api/v1/sprints/${temporarySprint.body.id}`).expect(204);

        const issue = await authedRequest().get(`/api/v1/issues/${issueKey}`).expect(200);
        expect(issue.body.sprintId).toBeNull();
      });

      it('POST /sprints/:id/start - should start sprint', async () => {
        await authedRequest()
          .post(`/api/v1/sprints/${sprintId}/issues`)
          .send({ issueIds: [issueId] })
          .expect(201);
        const res = await authedRequest()
          .post(`/api/v1/sprints/${sprintId}/start`);
        expect(res.status).toBeLessThan(300);
        expect(res.body.status).toBe('active');
      });

      it('does not allow a second active sprint in the same project', async () => {
        await authedRequest()
          .post(`/api/v1/sprints/${secondSprintId}/start`)
          .expect(400);
      });

      it('does not silently steal issues from another sprint', async () => {
        await authedRequest()
          .post(`/api/v1/sprints/${secondSprintId}/issues`)
          .send({ issueIds: [issueId] })
          .expect(400);
      });

      it('POST /sprints/:id/complete - should complete sprint', async () => {
        const res = await authedRequest()
          .post(`/api/v1/sprints/${sprintId}/complete`);
        expect(res.status).toBeLessThan(300);
        expect(res.body.status).toBe('completed');

        const issue = await authedRequest()
          .get(`/api/v1/issues/${issueKey}`)
          .expect(200);
        expect(issue.body.sprintId).toBeNull();
      });

      it('does not add issues to a completed sprint', async () => {
        await authedRequest()
          .post(`/api/v1/sprints/${sprintId}/issues`)
          .send({ issueIds: [issueId] })
          .expect(400);
      });

      it('rejects editing or deleting a completed sprint', async () => {
        await authedRequest()
          .patch(`/api/v1/sprints/${sprintId}`)
          .send({ name: 'Rewritten History' })
          .expect(400);
        await authedRequest().delete(`/api/v1/sprints/${sprintId}`).expect(400);
      });
    });

    describe('Comments', () => {
      let commentId: string;

      it('POST /issues/:key/comments - should create a comment', async () => {
        const res = await authedRequest()
          .post(`/api/v1/issues/${issueKey}/comments`)
          .send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test comment' }] }] } })
          .expect(201);
        commentId = res.body.id;
        expect(res.body.issueId).toBeDefined();
      });

      it('GET /issues/:key/comments - should list comments', async () => {
        const res = await authedRequest()
          .get(`/api/v1/issues/${issueKey}/comments`)
          .expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(1);
      });

      it('PATCH /issues/:key/comments/:id - should update comment', async () => {
        const res = await authedRequest()
          .patch(`/api/v1/issues/${issueKey}/comments/${commentId}`)
          .send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated comment' }] }] } })
          .expect(200);
        expect(res.body.body).toBeDefined();
      });

      it('DELETE /issues/:key/comments/:id - should delete comment', async () => {
        await authedRequest()
          .delete(`/api/v1/issues/${issueKey}/comments/${commentId}`)
          .expect(204);
      });
    });

    describe('Activity Log', () => {
      it('GET /issues/:key/activity - should list activity', async () => {
        const res = await authedRequest()
          .get(`/api/v1/issues/${issueKey}/activity`)
          .expect(200);
        expect(Array.isArray(res.body)).toBe(true);
      });
    });

    describe('Issue Links', () => {
      let secondIssueKey: string;
      let linkId: string;

      beforeAll(async () => {
        const res = await authedRequest()
          .post(`/api/v1/projects/${projectKey}/issues`)
          .send({ summary: 'Second issue for linking' })
          .expect(201);
        secondIssueKey = res.body.key;
      });

      it('POST /issue-links - should create a link', async () => {
        const res = await authedRequest()
          .post('/api/v1/issue-links')
          .send({
            sourceIssueId: issueId,
            targetIssueId: (await authedRequest().get(`/api/v1/issues/${secondIssueKey}`).expect(200)).body.id,
            linkType: 'blocks',
          })
          .expect(201);
        linkId = res.body.id;
        expect(res.body.linkType).toBe('blocks');
      });

      it('GET /issue-links/by-issue/:issueId - should list links for issue', async () => {
        const res = await authedRequest()
          .get(`/api/v1/issue-links/by-issue/${issueId}`)
          .expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(1);
      });

      it('DELETE /issue-links/:id - should delete link', async () => {
        await authedRequest().delete(`/api/v1/issue-links/${linkId}`).expect(204);
      });
    });

    describe('Referential integrity', () => {
      it('rejects deleting a status that is still used by an issue', async () => {
        await authedRequest()
          .delete(`/api/v1/workflows/${projectWorkflowId}/statuses/${issueStatusId}`)
          .expect(409);
      });

      it('rejects deleting a workflow that is still assigned to a project', async () => {
        await authedRequest().delete(`/api/v1/workflows/${projectWorkflowId}`).expect(409);
      });
    });

    // Cleanup
    afterAll(async () => {
      // Delete board and sprint
      if (boardId) await authedRequest().delete(`/api/v1/boards/${boardId}`).expect(204);
    });
  });
});
