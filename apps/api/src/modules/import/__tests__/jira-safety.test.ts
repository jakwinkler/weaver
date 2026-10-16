import { FieldMapperService } from '../field-mapper.service';
import { CommentsService } from '../../comments/comments.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CommentEntity, IssueEntity } from '@weaver/db';
import { commentVisibility, ImportOrchestrator, FieldMapper } from '@weaver/jira-import';

describe('Jira migration safety regressions', () => {
  it('starts the four independent source reads before awaiting any response', async () => {
    const requests: string[] = [];
    let release!: () => void;
    const response = new Promise<never[]>((resolve) => {
      release = () => resolve([]);
    });
    const names = ['getComments', 'getWorklogs', 'getChangelogs', 'getRemoteLinks'];
    const client = Object.fromEntries(
      names.map((name) => [
        name,
        () => {
          requests.push(name);
          return response;
        },
      ]),
    );
    const orchestrator = new ImportOrchestrator(
      { getRepository: () => ({ findBy: async () => [] }) } as never,
      client as never,
      new FieldMapper(),
      { config: { baseUrl: 'https://jira.example.test' } } as never,
    );
    const pending = (
      orchestrator as unknown as {
        importChildren: (issue: unknown, issueId: string, projectId: string) => Promise<void>;
      }
    ).importChildren({ id: 'source', key: 'GS-1', fields: {} }, 'issue', 'project');
    const beforeFirstResponse = requests.slice();
    release();
    await pending;
    expect(beforeFirstResponse).toEqual(names);
  });

  it.each([null, { type: 'role', identifier: 'Internal', value: 'Internal' }])(
    'resolves numeric reply parent IDs from the live Jira API',
    (visibility) => {
      const parent = { id: '806291', visibility };
      const reply = { id: '806292', parentId: 806291 };
      expect(
        commentVisibility('jira', reply as never, new Map([['806291', parent]]) as never),
      ).toEqual(visibility ? { sourceInstance: 'jira', ...visibility } : null);
    },
  );

  it('inherits a restricted parent audience for replies without their own restriction', () => {
    const parent = {
      id: 'parent',
      visibility: { type: 'group', identifier: 'internal', value: 'Internal' },
    };
    const reply = { id: 'reply', parentId: 'parent' };
    expect(
      commentVisibility('jira', reply as never, new Map([['parent', parent]]) as never),
    ).toMatchObject({ type: 'group', identifier: 'internal' });
  });

  it('keeps missing, cyclic and conflicting comment ancestry administrator-only', () => {
    const missing = { id: 'missing', parentId: 'absent' };
    const cyclic = { id: 'cycle', parentId: 'cycle' };
    const parent = { id: 'parent', visibility: { type: 'role', value: 'Internal' } };
    const conflicting = {
      id: 'child',
      parentId: 'parent',
      visibility: { type: 'group', value: 'Different audience' },
    };
    for (const comment of [missing, cyclic, conflicting]) {
      const all = new Map<string, typeof parent | typeof cyclic>([
        ['parent', parent],
        ['cycle', cyclic],
      ]);
      expect(commentVisibility('jira', comment as never, all as never)?.type).toBe('unknown');
    }
  });
  it('uses the canonical Jira in progress category for Deploy and In Testing', () => {
    const mapper = new FieldMapperService();
    for (const name of ['Deploy', 'In Testing', 'In Development']) {
      expect(
        mapper.mapStatusCategory({ id: name, name, statusCategory: { key: 'indeterminate' } }),
      ).toBe('in_progress');
    }
  });

  it('does not return a restricted imported comment to a project reader', async () => {
    const comments = [
      { id: 'public', issueId: 'issue', authorId: 'person', body: {}, visibility: null },
      {
        id: 'internal',
        issueId: 'issue',
        authorId: 'person',
        body: {},
        visibility: {
          sourceInstance: 'jira',
          type: 'role',
          identifier: 'internal',
          value: 'Internal',
        },
      },
    ];
    const em = {
      getRepository: (entity: unknown) =>
        entity === IssueEntity
          ? { findOneBy: async () => ({ id: 'issue' }) }
          : entity === CommentEntity
            ? { find: async () => comments }
            : { findOneBy: async () => null },
    };
    const service = new CommentsService(
      { getEntityManager: async () => em } as never,
      { findById: async () => ({ displayName: 'Original author', email: '' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await (service as any).findByIssue('GS-2302', {
      userId: 'reader',
      role: 'member',
    });
    expect(result.map((comment: any) => comment.id)).toEqual(['public']);
  });

  it('refuses to create a notification for a placeholder without tenant membership', async () => {
    const save = jest.fn(async (value) => value);
    const emitToUser = jest.fn();
    const service = new NotificationsService(
      {
        getEntityManager: async () => ({
          query: async () => [],
          getRepository: () => ({ create: (value: any) => value, save }),
        }),
      } as never,
      { emitToUser } as never,
    );
    await expect(service.create('placeholder', 'mention', 'Imported person')).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });
});
