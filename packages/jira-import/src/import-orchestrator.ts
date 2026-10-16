import { createHash, randomUUID } from 'crypto';
import { createStorageFromEnvironment } from '@weaver/server-common';
import path from 'path';
import type { EntityManager, Repository } from 'typeorm';
import {
  AttachmentEntity,
  BoardEntity,
  CommentEntity,
  CustomFieldDefinitionEntity,
  ImportJobEntity,
  ImportRecordEntity,
  ImportedResourceEntity,
  IssueEntity,
  IssueLinkEntity,
  IssueTypeEntity,
  ProjectEntity,
  ProjectIssueTypeEntity,
  ProjectMemberEntity,
  SprintEntity,
  TimeEntryEntity,
  WorkflowEntity,
  WorkflowStatusEntity,
} from '@weaver/db';
import type { ImportJobError, JiraImportJobData, JiraProjectSummary } from '@weaver/shared';
import { FieldMapper } from './field-mapper';
import { JiraClient } from './jira-client';
import { SourceStore, commentVisibility, sourceVisibility } from './source-store';
import type {
  ImportProgress,
  JiraAttachment,
  JiraIssue,
  JiraProjectDetails,
  JiraProjectIssueTypeStatuses,
  JiraSprint,
} from './types';

export interface KeySelection {
  key: string;
  nextCounter: number;
  preserved: boolean;
}

export function filterSelectedProjects<T extends JiraProjectSummary>(
  projects: T[],
  selectedProjectKeys?: string[],
): T[] {
  if (selectedProjectKeys === undefined) return projects;
  const selected = new Set(selectedProjectKeys.map((key) => key.toUpperCase()));
  const accessible = new Set(projects.map((project) => project.key.toUpperCase()));
  const missing = [...selected].filter((key) => !accessible.has(key));
  if (missing.length > 0) {
    throw new Error(`Selected Jira projects are not accessible: ${missing.join(', ')}`);
  }
  return projects.filter((project) => selected.has(project.key.toUpperCase()));
}

export function selectIssueKey(
  jiraKey: string,
  projectKey: string,
  currentCounter: number,
  existingKeys: Set<string>,
): KeySelection {
  const match = jiraKey.match(/^([A-Z][A-Z0-9]{1,9})-(\d+)$/i);
  if (
    match &&
    match[1].toUpperCase() === projectKey.toUpperCase() &&
    !existingKeys.has(jiraKey.toUpperCase())
  ) {
    const number = Number(match[2]);
    return {
      key: jiraKey.toUpperCase(),
      nextCounter: Math.max(currentCounter, number),
      preserved: true,
    };
  }

  let nextCounter = currentCounter;
  let key: string;
  do {
    nextCounter += 1;
    key = `${projectKey.toUpperCase()}-${nextCounter}`;
  } while (existingKeys.has(key));
  return { key, nextCounter, preserved: false };
}

export function getSprintReconciliationTarget(
  externalSprintId: string | null,
  importedSprints: ReadonlyMap<string, string>,
  currentSprintId: string | null,
): string | null {
  if (!externalSprintId) return null;
  const importedSprintId = importedSprints.get(externalSprintId);
  return importedSprintId && importedSprintId !== currentSprintId ? importedSprintId : null;
}

export async function reconcileExistingIssueSprint(
  issueRepo: Pick<Repository<IssueEntity>, 'findOneBy' | 'update'>,
  localIssueId: string,
  externalSprintId: string | null,
  importedSprints: ReadonlyMap<string, string>,
): Promise<boolean> {
  if (!externalSprintId || !importedSprints.has(externalSprintId)) return false;
  const existingIssue = await issueRepo.findOneBy({ id: localIssueId });
  if (!existingIssue) return false;
  const sprintTarget = getSprintReconciliationTarget(
    externalSprintId,
    importedSprints,
    existingIssue.sprintId,
  );
  if (!sprintTarget) return false;
  await issueRepo.update(localIssueId, { sprintId: sprintTarget });
  return true;
}

export type ProgressCallback = (progress: ImportProgress) => Promise<void> | void;

export class ImportOrchestrator {
  private readonly sourceInstance: string;
  private errors: ImportJobError[] = [];
  private totalItems = 0;
  private importedItems = 0;
  private skippedItems = 0;
  private store: SourceStore;
  private report = {
    counts: {} as Record<string, number>,
    conflicts: [] as string[],
    warnings: [] as string[],
    restrictedComments: 0,
    restrictedWorklogs: 0,
    scope: { updatedSince: null as string | null },
  };

  constructor(
    private readonly manager: EntityManager,
    private readonly client: JiraClient,
    private readonly mapper: FieldMapper,
    private readonly data: JiraImportJobData,
    private readonly onProgress?: ProgressCallback,
  ) {
    this.sourceInstance = normalizeSourceInstance(data.config.baseUrl);
    this.store = new SourceStore(manager, this.sourceInstance, data.importJobId);
    this.report.scope.updatedSince = data.updatedSince ?? null;
    if (data.updatedSince)
      this.warn(
        `Partial import: issues updated since ${data.updatedSince}. Their complete history is retained; older issues are excluded.`,
      );
  }

  async run(): Promise<void> {
    try {
      await this.checkCancelled();
      await this.updateJob('Connecting to Jira', { status: 'running', startedAt: new Date() });
      await this.manager.query(
        `UPDATE public.tenants SET settings = jsonb_set(settings, '{importRequiresInvitation}', 'true') WHERE id = $1`,
        [this.data.tenantId],
      );
      await this.client.testConnection(this.data.config);
      const projects = filterSelectedProjects(
        await this.client.getProjects(this.data.config),
        this.data.projectKeys,
      );
      const metadata = await this.client.getFieldMetadata(this.data.config);
      const fieldNames = Object.fromEntries(metadata.map((field) => [field.id, field.name]));
      for (const project of projects) {
        await this.checkCancelled();
        try {
          await this.importProject(project, fieldNames, metadata);
        } catch (error) {
          if (error instanceof ImportCancelledError) throw error;
          this.recordError('project', project.key, error);
        }
      }
      const incomplete =
        this.errors.length > 0 ||
        this.report.conflicts.length > 0 ||
        this.report.warnings.length > 0;
      await this.updateJob(
        incomplete ? 'Import needs review' : 'Import complete; invitations remain off',
        {
          status: incomplete ? 'needs_review' : 'completed',
          progress: 100,
          completedAt: new Date(),
        },
      );
    } catch (error) {
      if (error instanceof ImportCancelledError) {
        await this.updateJob('Import cancelled; imported records retained', {
          status: 'cancelled',
          completedAt: new Date(),
        });
        return;
      }
      this.recordError('import', this.data.importJobId, error);
      await this.updateJob('Import failed', { status: 'failed', completedAt: new Date() });
      throw error;
    }
  }

  private async importProject(
    summary: JiraProjectSummary,
    fields: Record<string, string>,
    metadata: Array<Record<string, any>>,
  ): Promise<void> {
    const priorProject = await this.findRecord('project', summary.id);
    if (priorProject)
      await this.manager
        .getRepository(ProjectEntity)
        .update(priorProject.localId, { importQuarantined: true });
    const details = await this.client.getProjectDetails(this.data.config, summary.key);
    const project = await this.ensureProject(details);
    await this.manager.getRepository(ProjectEntity).update(project.id, { importQuarantined: true });
    await this.capture('project', summary.id, project.id, details);
    await this.capture('field_metadata', summary.id, project.id, { fields: metadata });
    if (details.lead)
      await this.manager.getRepository(ProjectEntity).update(project.id, {
        leadUserId: await this.store.person(details.lead, project.id, `project-lead:${summary.id}`),
      });
    const groups = await this.client.getProjectStatuses(this.data.config, summary.key);
    const { statusIds, issueTypeIds } = await this.ensureWorkflow(project, groups);
    await this.capture('workflow_statuses', summary.id, project.id, { groups });
    this.warn(
      'Jira transition conditions and validators require review in the workflow editor before enabling status changes.',
    );
    for (const [kind, fetch] of [
      ['version', () => this.client.getVersions(this.data.config, summary.key)],
      ['component', () => this.client.getComponents(this.data.config, summary.key)],
    ] as const) {
      await this.attempt(kind, summary.key, async () => {
        for (const value of await fetch())
          await this.capture(kind, String(value.id), project.id, value);
      });
    }
    await this.attempt('boards', summary.key, async () => {
      for (const board of await this.client.getBoards(this.data.config, summary.key)) {
        const config = await this.client.getBoardConfig(this.data.config, board.id);
        if (config.filter?.id) {
          const filter = await this.client.getFilter(this.data.config, String(config.filter.id));
          await this.capture('filter', String(config.filter.id), project.id, filter);
          config.filter = filter;
        }
        await this.capture('board', String(board.id), project.id, {
          ...board,
          configuration: config,
        });
        const repo = this.manager.getRepository(BoardEntity);
        const record = await this.findRecord('board', String(board.id));
        const existing = record ? await repo.findOneBy({ id: record.localId }) : null;
        const columns = (config.columnConfig?.columns ?? []).map((c: any) => ({
          name: c.name,
          statusIds: (c.statuses ?? []).map((v: any) => statusIds.get(v.id)).filter(Boolean),
        }));
        const saved = await repo.save(
          repo.create({
            ...existing,
            projectId: project.id,
            name: board.name ?? project.name,
            type: board.type === 'scrum' ? 'scrum' : 'kanban',
            config: {
              ...existing?.config,
              columns,
              jiraFilter: config.filter,
              jiraSubQuery: config.subQuery,
            },
          }),
        );
        await this.createRecord('board', String(board.id), saved.id);
        this.warn(
          'Board filters and subqueries are preserved as source metadata; review them before using the imported board.',
        );
      }
    });
    const sprintIds = new Map<string, string>();
    await this.attempt('sprints', summary.key, async () => {
      for (const sprint of await this.client.getSprints(this.data.config, summary.key)) {
        const saved = await this.ensureSprint(project, sprint);
        sprintIds.set(String(sprint.id), saved.id);
        await this.capture('sprint', String(sprint.id), project.id, sprint);
      }
    });
    const issueRepo = this.manager.getRepository(IssueEntity);
    const keys = new Set((await issueRepo.find({ select: { key: true } })).map((v) => v.key));
    let securedIssues = false;
    const errorsBeforeIssues = this.errors.length;
    const sourceIssues = new Map<
      string,
      {
        id: string;
        key: string;
        parent: string | null;
        epic: string | null;
        isSubtask: boolean;
        updatedAt?: string;
        baseline: Record<string, any> | null;
        created: boolean;
      }
    >();
    for await (const page of this.client.issuePages(
      this.data.config,
      [summary.key],
      this.data.updatedSince,
    )) {
      for (const jira of page) {
        await this.checkCancelled();
        this.totalItems++;
        await this.attempt('issue', jira.key, async () => {
          // Never expose an issue security level through a destination without an equivalent rule.
          if (jira.fields.security) {
            securedIssues = true;
            await this.manager
              .getRepository(ProjectEntity)
              .update(project.id, { visibility: 'private', importQuarantined: true });
            await this.capture(
              'secured_issue',
              jira.id,
              project.id,
              jira,
              null,
              sourceVisibility(this.sourceInstance, {
                type: 'unknown',
                value: 'Jira issue security level',
              }),
            );
            throw new Error(
              'Secured issue retained in administrator source archive; destination access mapping is required',
            );
          }
          const mapped = this.mapper.mapIssue(jira, fields, this.sourceInstance);
          const record = await this.findRecord('issue', jira.id);
          const existing = record ? await issueRepo.findOneBy({ id: record.localId }) : null;
          const baseline = existing
            ? await this.manager.getRepository(ImportedResourceEntity).findOneBy({
                sourceInstance: this.sourceInstance,
                kind: 'issue',
                externalId: jira.id,
              })
            : null;
          this.reportUnsupported(jira.fields.description);
          const assigneeId = mapped.assignee
            ? await this.store.person(mapped.assignee, project.id, `assignee:${jira.id}`)
            : null;
          const reporterId = await this.store.person(
            mapped.reporter,
            project.id,
            `reporter:${jira.id}`,
          );
          const mentions = await this.store.mentions(jira.fields.description, project.id);
          const customFields = {
            ...mapped.customFields,
            'jira.original-key': jira.key,
            'jira.source-url': `${this.sourceInstance}/browse/${encodeURIComponent(jira.key)}`,
            'jira.fix-versions': (jira.fields.fixVersions ?? []).map((v: any) => v.name),
            'jira.affected-versions': (jira.fields.versions ?? []).map((v: any) => v.name),
            'jira.components': (jira.fields.components ?? []).map((v: any) => v.name),
            'jira.resolution': jira.fields.resolution?.name ?? null,
            'jira.original-estimate-seconds': jira.fields.timeoriginalestimate ?? null,
            'jira.remaining-estimate-seconds': jira.fields.timeestimate ?? null,
          };
          await this.ensureCustomFieldDefinitions(customFields, mapped.customFieldNames);
          if (jira.fields.creator)
            await this.store.person(jira.fields.creator, project.id, `creator:${jira.id}`);
          const statusId = mapped.status ? statusIds.get(mapped.status.id) : undefined;
          if (!statusId) throw new Error('Jira issue status has no destination mapping');
          const values: Record<string, any> = {
            summary: mapped.summary,
            description: this.mapper.mapDescription(jira.fields.description, mentions),
            statusId,
            issueTypeId: mapped.issueType ? issueTypeIds.get(mapped.issueType.id) : null,
            priority: mapped.priority,
            assigneeId,
            reporterId,
            customFields,
            storyPoints: mapped.storyPoints,
            sprintId: mapped.sprintExternalId
              ? (sprintIds.get(mapped.sprintExternalId) ?? null)
              : null,
            labels: mapped.labels,
            dueDate: mapped.dueDate,
            startDate: this.sourceDate(jira, fields, 'start date'),
            percentDone: this.mapper.mapStatusCategory(mapped.status!) === 'done' ? 100 : 0,
          };
          let saved: IssueEntity;
          await this.manager.transaction(async (em) => {
            const repo = em.getRepository(IssueEntity);
            if (existing) {
              const beforeConflicts = this.report.conflicts.length;
              const updates = this.safeUpdates(
                existing,
                values,
                baseline?.nativeSnapshot,
                jira.key,
              );
              // Repair legacy attribution independently of editable fields.
              if (!baseline?.nativeSnapshot) {
                updates.assigneeId = assigneeId;
                updates.reporterId = reporterId;
              }
              await repo.update(existing.id, {
                ...updates,
                updatedAt:
                  this.report.conflicts.length > beforeConflicts
                    ? existing.updatedAt
                    : (mapped.updatedAt ?? existing.updatedAt),
              });
              saved = { ...existing, ...updates };
            } else {
              const selection = selectIssueKey(jira.key, project.key, project.issueCounter, keys);
              project.issueCounter = selection.nextCounter;
              keys.add(selection.key);
              saved = await repo.save(
                repo.create({
                  ...values,
                  key: selection.key,
                  projectId: project.id,
                  parentId: null,
                  epicId: null,
                  sortOrder: 0,
                  ...(mapped.createdAt ? { createdAt: mapped.createdAt } : {}),
                  ...(mapped.updatedAt ? { updatedAt: mapped.updatedAt } : {}),
                }),
              );
            }
            const store = new SourceStore(em, this.sourceInstance, this.data.importJobId);
            await store.resource('issue', jira.id, project.id, jira, saved!.id, null, values);
            await this.createRecord('issue', jira.id, saved!.id, em);
          });
          const id = saved!.id;
          const epicField = Object.entries(fields).find(
            ([, name]) => name.toLowerCase() === 'epic link',
          )?.[0];
          sourceIssues.set(jira.id, {
            id,
            key: jira.key,
            parent: mapped.parentExternalId,
            epic: epicField ? (jira.fields[epicField] ?? null) : null,
            isSubtask: jira.fields.issuetype?.subtask === true,
            updatedAt: jira.fields.updated,
            baseline: baseline?.nativeSnapshot ?? null,
            created: !existing,
          });
          this.count('issue');
          this.importedItems++;
          await this.importChildren(jira, id, project.id);
          await this.emitProgress(`Imported ${jira.key}`);
        });
      }
      await this.manager
        .getRepository(ProjectEntity)
        .update(project.id, { issueCounter: project.issueCounter });
    }
    // Link hierarchy and relationships after both ends have durable source mappings.
    for (const [externalId, item] of sourceIssues) {
      await this.attempt('relationships', item.key, async () => {
        const parent = item.parent
          ? (await this.findRecord('issue', item.parent))?.localId
          : undefined;
        const epicSource = item.epic
          ? await this.manager
              .getRepository(ImportedResourceEntity)
              .createQueryBuilder('source')
              .where(
                "source.source_instance = :source AND source.kind = :kind AND source.payload ->> 'key' = :key",
                { source: this.sourceInstance, kind: 'issue', key: item.epic },
              )
              .getOne()
          : null;
        const epic = epicSource?.issueId;
        const epicId = epic ?? (!item.isSubtask ? parent : null) ?? null;
        const relations = { parentId: item.isSubtask ? (parent ?? null) : null, epicId };
        const current = await issueRepo.findOneByOrFail({ id: item.id });
        const updates = item.created
          ? relations
          : this.safeUpdates(current, relations, item.baseline, item.key);
        // Older imports stored an epic as parentId; migrate that exact source association.
        if (!item.baseline && !item.isSubtask && current.parentId === parent) {
          updates.parentId = null;
          updates.epicId = epicId;
        }
        await issueRepo.update(item.id, { ...updates, updatedAt: current.updatedAt });
        const source = await this.manager
          .getRepository(ImportedResourceEntity)
          .findOneBy({ sourceInstance: this.sourceInstance, kind: 'issue', externalId });
        if (source) {
          source.nativeSnapshot = { ...source.nativeSnapshot, ...relations };
          await this.manager.getRepository(ImportedResourceEntity).save(source);
        }
        for (const link of source?.payload.fields?.issuelinks ?? []) {
          const target = link.outwardIssue ?? link.inwardIssue;
          const targetId = target?.id
            ? (await this.findRecord('issue', target.id))?.localId
            : undefined;
          if (!targetId) {
            this.warn(
              'Some linked issues are outside the selected import scope; original link data is retained.',
            );
            continue;
          }
          const from = link.outwardIssue ? item.id : targetId;
          const to = link.outwardIssue ? targetId : item.id;
          const repo = this.manager.getRepository(IssueLinkEntity);
          const originalType = String(link.type?.name ?? 'relates');
          const type = /block/i.test(originalType)
            ? 'blocks'
            : /duplicat/i.test(originalType)
              ? 'duplicates'
              : /clone/i.test(originalType)
                ? 'clones'
                : 'relates-to';
          if (!(await repo.findOneBy({ linkType: type, sourceIssueId: from, targetIssueId: to })))
            await repo.save(
              repo.create({ linkType: type, sourceIssueId: from, targetIssueId: to }),
            );
        }
      });
    }
    // Jira Rank is opaque; sort it as a value and materialize an ordinal for Weaver.
    const rankField = Object.entries(fields).find(([, name]) => name.toLowerCase() === 'rank')?.[0];
    if (rankField) {
      const resources = await this.manager
        .getRepository(ImportedResourceEntity)
        .findBy({ projectId: project.id, kind: 'issue', sourceInstance: this.sourceInstance });
      resources.sort((a, b) =>
        String(a.payload.fields?.[rankField] ?? '').localeCompare(
          String(b.payload.fields?.[rankField] ?? ''),
        ),
      );
      for (const [sortOrder, resource] of resources.entries()) {
        const item = sourceIssues.get(resource.externalId);
        if (!resource.issueId || !item) continue;
        const current = await issueRepo.findOneByOrFail({ id: resource.issueId });
        const updates = item.created
          ? { sortOrder }
          : this.safeUpdates(current, { sortOrder }, item.baseline, item.key);
        await issueRepo.update(current.id, { ...updates, updatedAt: current.updatedAt });
        resource.nativeSnapshot = { ...resource.nativeSnapshot, sortOrder };
        await this.manager.getRepository(ImportedResourceEntity).save(resource);
      }
    }
    // Missing records can mean lost source permissions. Retain old data only for
    // administrators until a complete source pass establishes current visibility.
    const priorIssues = await this.manager
      .getRepository(ImportedResourceEntity)
      .findBy({ projectId: project.id, sourceInstance: this.sourceInstance });
    const unavailable = priorIssues.filter(
      (resource) =>
        ['issue', 'secured_issue'].includes(resource.kind) &&
        !sourceIssues.has(resource.externalId),
    );
    if (unavailable.length)
      this.warn(
        'Previously imported or secured issues are absent from the readable source set. This project remains administrator-only until source access is restored and reimported.',
      );
    if (!securedIssues && !unavailable.length && this.errors.length === errorsBeforeIssues)
      await this.manager
        .getRepository(ProjectEntity)
        .update(project.id, { importQuarantined: false });
  }

  private async importChildren(jira: JiraIssue, issueId: string, projectId: string): Promise<void> {
    // These source reads are independent. Persist their results sequentially so
    // attribution, transactions and resource-specific error handling stay ordered.
    const [commentsResult, worklogsResult, changelogsResult, remoteLinksResult] =
      await Promise.allSettled([
        this.client.getComments(this.data.config, jira.id),
        this.client.getWorklogs(this.data.config, jira.id),
        this.client.getChangelogs(this.data.config, jira.id),
        this.client.getRemoteLinks(this.data.config, jira.id),
      ]);
    await this.attempt('comments', jira.key, async () => {
      const comments = resolvedSource(commentsResult);
      if (
        typeof jira.fields.comment?.total === 'number' &&
        comments.length !== jira.fields.comment.total
      )
        this.recordError(
          'coverage',
          jira.key,
          new Error('Comment count changed or differs from Jira issue metadata'),
        );
      const byId = new Map(comments.map((v) => [v.id, v]));
      const prior = await this.manager.getRepository(CommentEntity).findBy({ issueId });
      for (const comment of prior) {
        if (!comment.sourceId || byId.has(comment.sourceId)) continue;
        const visibility = sourceVisibility(this.sourceInstance, {
          type: 'unknown',
          value: 'Comment no longer visible to the Jira account',
        });
        await this.store.audience(visibility);
        await this.manager
          .getRepository(CommentEntity)
          .update(comment.id, { visibility, updatedAt: comment.updatedAt });
        this.warn(
          'Previously imported comments absent from Jira are retained for administrators until visibility can be verified again.',
        );
      }
      for (const comment of comments) {
        await this.checkCancelled();
        await this.attempt('comment', comment.id, async () => {
          this.reportUnsupported(comment.body);
          const visibility = commentVisibility(this.sourceInstance, comment, byId);
          if (visibility) this.report.restrictedComments++;
          const authorId = await this.store.person(
            comment.author,
            projectId,
            `comment:${comment.id}`,
          );
          if (comment.updateAuthor)
            await this.store.person(
              comment.updateAuthor,
              projectId,
              `comment-editor:${comment.id}`,
            );
          const mentions = await this.store.mentions(comment.body, projectId);
          await this.manager.transaction(async (em) => {
            const repo = em.getRepository(CommentEntity);
            const record = await this.findRecord('comment', comment.id, em);
            const existing = record ? await repo.findOneBy({ id: record.localId }) : null;
            const saved = await repo.save(
              repo.create({
                ...existing,
                issueId,
                authorId,
                body: this.mapper.mapComment(comment, mentions),
                sourceId: comment.id,
                visibility,
                ...(comment.created ? { createdAt: new Date(comment.created) } : {}),
                ...(comment.updated ? { updatedAt: new Date(comment.updated) } : {}),
              }),
            );
            await new SourceStore(em, this.sourceInstance, this.data.importJobId).resource(
              'comment',
              comment.id,
              projectId,
              comment,
              issueId,
              visibility,
            );
            await this.createRecord('comment', comment.id, saved.id, em);
          });
          this.count('comment');
        });
      }
      for (const comment of comments) {
        const record = await this.findRecord('comment', comment.id);
        const parent = comment.parentId
          ? await this.findRecord('comment', String(comment.parentId))
          : null;
        if (record)
          await this.manager.getRepository(CommentEntity).update(record.localId, {
            parentCommentId: parent?.localId ?? null,
            ...(comment.updated ? { updatedAt: new Date(comment.updated) } : {}),
          });
      }
    });
    await this.attempt('worklogs', jira.key, async () => {
      const worklogs = resolvedSource(worklogsResult);
      if (
        typeof jira.fields.worklog?.total === 'number' &&
        worklogs.length !== jira.fields.worklog.total
      )
        this.recordError(
          'coverage',
          jira.key,
          new Error('Worklog count changed or differs from Jira issue metadata'),
        );
      for (const worklog of worklogs) {
        await this.checkCancelled();
        const visibility = sourceVisibility(this.sourceInstance, worklog.visibility);
        const userId = await this.store.person(worklog.author, projectId, `worklog:${worklog.id}`);
        await this.capture('worklog', String(worklog.id), projectId, worklog, issueId, visibility);
        const record = await this.findRecord('worklog', String(worklog.id));
        if (visibility) {
          this.report.restrictedWorklogs++;
          if (record) await this.manager.getRepository(TimeEntryEntity).delete(record.localId);
          continue;
        }
        await this.manager.transaction(async (em) => {
          const repo = em.getRepository(TimeEntryEntity);
          const existing = record ? await repo.findOneBy({ id: record.localId }) : null;
          const started = new Date(worklog.started);
          const seconds = Number(worklog.timeSpentSeconds);
          if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(started.getTime()))
            throw new Error('Invalid Jira worklog duration or start date');
          const saved = await repo.save(
            repo.create({
              ...existing,
              issueId,
              userId,
              minutes: Math.round(seconds / 60),
              description: this.plainText(worklog.comment).slice(0, 500) || null,
              loggedAt: started,
              startedAt: started,
              endedAt: new Date(started.getTime() + seconds * 1000),
              source: 'plugin',
              sourcePluginId: 'jira-import',
              sourceReference: `${this.sourceInstance}:${worklog.id}`,
              lockedAt: new Date(),
              lockReason:
                'Imported Jira worklog; original seconds and notes retained in source data',
              ...(worklog.created ? { createdAt: new Date(worklog.created) } : {}),
              ...(worklog.updated ? { updatedAt: new Date(worklog.updated) } : {}),
            }),
          );
          await this.createRecord('worklog', String(worklog.id), saved.id, em);
        });
      }
    });
    await this.attempt('changelog', jira.key, async () => {
      for (const change of resolvedSource(changelogsResult)) {
        if (change.author)
          await this.store.person(change.author, projectId, `history:${change.id}`);
        await this.capture('changelog', String(change.id), projectId, change, issueId);
      }
    });
    await this.attempt('remote_links', jira.key, async () => {
      for (const link of resolvedSource(remoteLinksResult))
        await this.capture('remote_link', String(link.id), projectId, link, issueId);
    });
    for (const attachment of jira.fields.attachment ?? []) {
      await this.checkCancelled();
      await this.attempt('attachment', attachment.id, async () => {
        // Jira attachment metadata does not identify private-comment files.
        const visibility = sourceVisibility(this.sourceInstance, {
          type: 'unknown',
          value: 'Imported Jira file requires access review',
        });
        this.warn(
          'Imported Jira files remain administrator-only until their access is explicitly reviewed in the issue attachment tab. Each reimport resets this review.',
        );
        const uploaderId = await this.store.person(
          attachment.author,
          projectId,
          `attachment:${attachment.id}`,
        );
        const repo = this.manager.getRepository(AttachmentEntity);
        const record = await this.findRecord('attachment', attachment.id);
        const existing = record ? await repo.findOneBy({ id: record.localId }) : null;
        if (existing) {
          await repo.update(existing.id, { uploaderId, sourceId: attachment.id, visibility });
          const archived = await this.manager.getRepository(ImportedResourceEntity).findOneBy({
            sourceInstance: this.sourceInstance,
            kind: 'attachment',
            externalId: attachment.id,
          });
          const storedHash = createHash('sha256')
            .update(await createStorageFromEnvironment().get(existing.storageKey))
            .digest('hex');
          let verifiedHash = archived?.payload.sha256;
          if (verifiedHash && verifiedHash !== storedHash)
            throw new Error(
              'Destination attachment bytes differ from the last verified Jira source; retained for review',
            );
          if (!verifiedHash) {
            // Legacy import records do not establish that the destination bytes
            // match Jira. Verify both copies before recording a source checksum.
            const sourceBytes = await this.client.downloadAttachment(this.data.config, attachment);
            if (attachment.size !== undefined && sourceBytes.byteLength !== attachment.size)
              throw new Error('Jira attachment size does not match source metadata');
            verifiedHash = createHash('sha256').update(sourceBytes).digest('hex');
            if (verifiedHash !== storedHash)
              throw new Error(
                'Legacy destination attachment bytes differ from Jira; retained for review',
              );
          }
          await this.capture(
            'attachment',
            attachment.id,
            projectId,
            {
              ...archived?.payload,
              ...attachment,
              sha256: verifiedHash,
              mediaId: archived?.payload.mediaId ?? (await this.attachmentMediaId(attachment)),
            },
            issueId,
            visibility,
          );
          return;
        }
        const storage = createStorageFromEnvironment();
        const bytes = await this.client.downloadAttachment(this.data.config, attachment);
        const mediaId = await this.attachmentMediaId(attachment);
        if (attachment.size !== undefined && bytes.byteLength !== attachment.size)
          throw new Error('Jira attachment size does not match source metadata');
        const storageKey = randomUUID();
        await storage.put(storageKey, bytes);
        try {
          await this.manager.transaction(async (em) => {
            const r = em.getRepository(AttachmentEntity);
            const saved = await r.save(
              r.create({
                issueId,
                uploaderId,
                sourceId: attachment.id,
                visibility,
                filename: path.basename(attachment.filename).slice(0, 255),
                mimeType: attachment.mimeType ?? 'application/octet-stream',
                size: String(bytes.byteLength),
                storageKey,
                ...(attachment.created ? { createdAt: new Date(attachment.created) } : {}),
              }),
            );
            await this.createRecord('attachment', attachment.id, saved.id, em);
            await new SourceStore(em, this.sourceInstance, this.data.importJobId).resource(
              'attachment',
              attachment.id,
              projectId,
              { ...attachment, sha256: createHash('sha256').update(bytes).digest('hex'), mediaId },
              issueId,
              visibility,
            );
          });
        } catch (error) {
          await storage.delete(storageKey);
          throw error;
        }
        this.count('attachment');
      });
    }
  }

  private async attachmentMediaId(attachment: JiraAttachment): Promise<string | null> {
    if (this.data.config.source !== 'jira_cloud') return null;
    try {
      const id = await this.client.getAttachmentMediaId?.(this.data.config, attachment);
      if (id) return id;
    } catch {
      /* The downloaded file stays intact when media metadata is unavailable. */
    }
    this.warn(
      'Some embedded Jira attachment references could not be resolved. Imported files remain available in the attachment tab subject to their access review.',
    );
    return null;
  }

  private async ensureProject(jira: JiraProjectDetails): Promise<ProjectEntity> {
    const repo = this.manager.getRepository(ProjectEntity);
    const record = await this.findRecord('project', jira.id);
    if (record) {
      const existing = await repo.findOneBy({ id: record.localId });
      if (existing) return existing;
    }
    return this.manager.transaction(async (em) => {
      const r = em.getRepository(ProjectEntity);
      const existing = await r.find({ select: { key: true } });
      const project = await r.save(
        r.create({
          key: uniqueProjectKey(jira.key, new Set(existing.map((v) => v.key))),
          name: jira.name,
          description: jira.description ?? null,
          leadUserId: this.data.requestedByUserId,
          issueCounter: 0,
          visibility: 'private',
          importQuarantined: true,
          customFields: {
            'jira.source-id': jira.id,
            'jira.original-key': jira.key,
            'jira.source-url': this.sourceInstance,
          },
        }),
      );
      await em
        .getRepository(ProjectMemberEntity)
        .save({ projectId: project.id, userId: this.data.requestedByUserId, role: 'lead' });
      await this.createRecord('project', jira.id, project.id, em);
      return project;
    });
  }

  private async ensureWorkflow(project: ProjectEntity, groups: JiraProjectIssueTypeStatuses[]) {
    const workflowRepo = this.manager.getRepository(WorkflowEntity);
    if (!project.workflowId) {
      const workflow = await workflowRepo.save(
        workflowRepo.create({ name: `${project.name} (Jira)`, isDefault: false }),
      );
      project.workflowId = workflow.id;
      await this.manager
        .getRepository(ProjectEntity)
        .update(project.id, { workflowId: workflow.id });
    }
    const statusRepo = this.manager.getRepository(WorkflowStatusEntity);
    const statusIds = new Map<string, string>();
    const issueTypeIds = new Map<string, string>();
    const statuses = dedupeStatuses(groups.flatMap((g) => g.statuses ?? []));
    const initial = statuses.find((v) => this.mapper.mapStatusCategory(v) === 'todo')?.id;
    for (const [position, jira] of statuses.entries()) {
      let status = await statusRepo.findOneBy({ workflowId: project.workflowId!, name: jira.name });
      const category = this.mapper.mapStatusCategory(jira);
      status = await statusRepo.save(
        statusRepo.create({
          ...status,
          workflowId: project.workflowId!,
          name: jira.name,
          category,
          color: statusColor(category),
          isInitial: jira.id === initial,
          isTerminal: category === 'done',
          position,
        }),
      );
      statusIds.set(jira.id, status.id);
    }

    for (const group of groups) {
      const repo = this.manager.getRepository(IssueTypeEntity);
      let type = await repo.findOneBy({ slug: this.mapper.slugify(group.name) });
      if (!type)
        type = await repo.save(
          repo.create({
            slug: this.mapper.slugify(group.name),
            name: group.name,
            isSubtask: group.subtask ?? false,
          }),
        );
      issueTypeIds.set(group.id, type.id);
      const map = this.manager.getRepository(ProjectIssueTypeEntity);
      if (!(await map.findOneBy({ projectId: project.id, issueTypeId: type.id })))
        await map.save(map.create({ projectId: project.id, issueTypeId: type.id }));
    }

    return { statusIds, issueTypeIds };
  }

  private async ensureSprint(project: ProjectEntity, jira: JiraSprint): Promise<SprintEntity> {
    const repo = this.manager.getRepository(SprintEntity);
    const record = await this.findRecord('sprint', String(jira.id));
    const existing = record ? await repo.findOneBy({ id: record.localId }) : null;
    const saved = await repo.save(
      repo.create({
        ...existing,
        projectId: project.id,
        name: jira.name,
        goal: jira.goal ?? null,
        startDate: dateOnly(jira.startDate),
        endDate: dateOnly(jira.endDate),
        status:
          jira.state === 'closed' ? 'completed' : jira.state === 'active' ? 'active' : 'planned',
      }),
    );
    await this.createRecord('sprint', String(jira.id), saved.id);
    return saved;
  }

  private async ensureCustomFieldDefinitions(
    values: Record<string, unknown>,
    names: Record<string, string>,
  ): Promise<void> {
    const repo = this.manager.getRepository(CustomFieldDefinitionEntity);
    for (const [slug, value] of Object.entries(values)) {
      if (value === null) continue;
      const current = await repo.findOneBy({ slug, entityType: 'issue' });
      const choices = Array.isArray(value)
        ? [...new Set([...((current?.options?.choices as string[]) ?? []), ...value.map(String)])]
        : null;
      if (!current || choices)
        await repo.save(
          repo.create({
            ...current,
            name: names[slug] ?? slug.replace(/^jira\./, 'Jira '),
            slug,
            fieldType: current?.fieldType ?? this.mapper.inferCustomFieldType(value),
            entityType: 'issue',
            pluginId: null,
            options: choices ? { choices } : null,
            validation: null,
            required: false,
          }),
        );
    }
  }

  private safeUpdates(
    existing: IssueEntity,
    values: Record<string, any>,
    previous: Record<string, any> | null | undefined,
    key: string,
  ): Record<string, any> {
    const updates: Record<string, any> = {};
    const conflict = (field: string) => {
      if (this.report.conflicts.length < 1000)
        this.report.conflicts.push(
          `${key}: ${field} differs from the last imported value; destination value retained`,
        );
    };
    for (const [field, value] of Object.entries(values)) {
      const current = (existing as any)[field];
      if (field === 'customFields') {
        const merged = { ...current };
        const baseline = previous?.customFields ?? {};
        for (const slug of new Set([...Object.keys(value), ...Object.keys(baseline)])) {
          if (sameValue(current?.[slug], value[slug])) continue;
          if (sameValue(current?.[slug], baseline[slug])) {
            if (value[slug] === undefined) delete merged[slug];
            else merged[slug] = value[slug];
          } else conflict(`customFields.${slug}`);
        }
        updates.customFields = merged;
      } else if (!sameValue(current, value)) {
        if ((previous && sameValue(current, previous[field])) || (!previous && current == null))
          updates[field] = value;
        else conflict(field);
      }
    }
    return updates;
  }

  private reportUnsupported(body: unknown): void {
    const types = this.mapper.unsupportedNodes(body);
    for (const warning of this.mapper.sourceMediaWarnings(body)) this.warn(warning);
    if (types.length)
      this.warn(
        `Rich content uses ${types.join(', ')}. Text and attachment references are shown; original ADF is retained in administrator source records.`,
      );
  }

  private sourceDate(jira: JiraIssue, fields: Record<string, string>, name: string): string | null {
    const id = Object.entries(fields).find(([, n]) => n.toLowerCase() === name)?.[0];
    return dateOnly(id ? jira.fields[id] : undefined);
  }
  private plainText(value: any): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return typeof value.text === 'string'
      ? value.text
      : (value.content ?? []).map((v: any) => this.plainText(v)).join(' ');
  }
  private async capture(
    kind: string,
    id: string,
    projectId: string,
    payload: Record<string, any>,
    issueId: string | null = null,
    visibility: ReturnType<typeof sourceVisibility> = null,
  ): Promise<void> {
    await this.store.resource(kind, id, projectId, payload, issueId, visibility);
    this.count(kind);
  }
  private count(kind: string): void {
    this.report.counts[kind] = (this.report.counts[kind] ?? 0) + 1;
  }
  private warn(message: string): void {
    if (!this.report.warnings.includes(message)) this.report.warnings.push(message);
  }
  private async attempt(kind: string, id: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (error instanceof ImportCancelledError) throw error;
      this.recordError(kind, id, error);
    }
  }
  private async findRecord(
    type: string,
    externalId: string,
    em = this.manager,
  ): Promise<ImportRecordEntity | null> {
    return em
      .getRepository(ImportRecordEntity)
      .findOneBy({ sourceInstance: this.sourceInstance, externalType: type, externalId });
  }
  private async createRecord(
    type: string,
    externalId: string,
    localId: string,
    em = this.manager,
  ): Promise<void> {
    await em.getRepository(ImportRecordEntity).upsert(
      {
        sourceInstance: this.sourceInstance,
        externalType: type,
        externalId,
        localId,
        importJobId: this.data.importJobId,
      },
      ['sourceInstance', 'externalType', 'externalId'],
    );
  }

  private async checkCancelled(): Promise<void> {
    const job = await this.manager
      .getRepository(ImportJobEntity)
      .findOneBy({ id: this.data.importJobId });
    if (!job || job.status === 'cancelled') throw new ImportCancelledError();
  }
  private recordError(itemType: string, itemId: string, error: unknown): void {
    this.errors.push({
      itemType,
      itemId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  private async emitProgress(step: string): Promise<void> {
    await this.updateJob(step);
  }

  private async updateJob(
    currentStep: string,
    overrides: Partial<ImportJobEntity> = {},
  ): Promise<void> {
    const values = {
      currentStep: currentStep.slice(0, 100),
      totalItems: this.totalItems,
      importedItems: this.importedItems,
      skippedItems: this.skippedItems,
      errors: this.errors,
      report: this.report,
      progress: 0,
      ...overrides,
    };
    await this.manager
      .getRepository(ImportJobEntity)
      .save({ id: this.data.importJobId, ...values });
    await this.onProgress?.({
      currentStep,
      totalItems: this.totalItems,
      importedItems: this.importedItems,
      skippedItems: this.skippedItems,
      errors: this.errors,
    });
  }
}

function resolvedSource<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

class ImportCancelledError extends Error {}

function normalizeSourceInstance(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

function uniqueProjectKey(jiraKey: string, existing: Set<string>): string {
  let base = jiraKey
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  if (!/^[A-Z]/.test(base)) base = `J${base}`;
  if (base.length < 2) base = `${base}X`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (true) {
    const candidate = `${base.slice(0, 10 - String(suffix).length)}${suffix}`;
    if (!existing.has(candidate)) return candidate;
    suffix += 1;
  }
}

function dedupeStatuses<T extends { id: string; name: string }>(statuses: T[]): T[] {
  const result = new Map<string, T>();
  for (const status of statuses) result.set(status.id || status.name, status);
  return [...result.values()];
}

function statusColor(category: 'todo' | 'in_progress' | 'done'): string {
  if (category === 'done') return '#10B981';
  if (category === 'in_progress') return '#3B82F6';
  return '#6B7280';
}

function dateOnly(value?: string): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function sameValue(left: unknown, right: unknown): boolean {
  const canonical = (value: any): any =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
