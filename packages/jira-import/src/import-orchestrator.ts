import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { EntityManager, Repository } from 'typeorm';
import {
  AttachmentEntity,
  CommentEntity,
  CustomFieldDefinitionEntity,
  ImportJobEntity,
  ImportRecordEntity,
  IssueEntity,
  IssueTypeEntity,
  ProjectEntity,
  ProjectIssueTypeEntity,
  ProjectMemberEntity,
  SprintEntity,
  WorkflowEntity,
  WorkflowStatusEntity,
  WorkflowTransitionEntity,
} from '@weaver/db';
import type { ImportJobError, JiraImportJobData, JiraProjectSummary } from '@weaver/shared';
import { FieldMapper } from './field-mapper';
import { JiraClient } from './jira-client';
import type {
  ImportProgress,
  JiraComment,
  JiraIssue,
  JiraProjectDetails,
  JiraProjectIssueTypeStatuses,
  JiraSprint,
} from './types';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/weaver-uploads';
const MAX_RECORDED_ERRORS = 500;

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

  constructor(
    private readonly manager: EntityManager,
    private readonly client: JiraClient,
    private readonly mapper: FieldMapper,
    private readonly data: JiraImportJobData,
    private readonly onProgress?: ProgressCallback,
  ) {
    this.sourceInstance = normalizeSourceInstance(data.config.baseUrl);
  }

  async run(): Promise<void> {
    try {
      await this.updateJob('Connecting to Jira', { status: 'running', startedAt: new Date() });
      await this.client.testConnection(this.data.config);
      await this.checkCancelled();

      const allProjects = await this.client.getProjects(this.data.config);
      const projects = filterSelectedProjects(allProjects, this.data.projectKeys);
      this.totalItems = projects.length;
      await this.updateJob('Reading Jira field metadata');
      const fieldNames = await this.client.getFieldNames(this.data.config);

      for (const project of projects) {
        await this.checkCancelled();
        await this.importProject(project, fieldNames);
      }

      await this.updateJob('Import complete', {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof ImportCancelledError) {
        await this.updateJob('Import cancelled', {
          status: 'cancelled',
          completedAt: new Date(),
        });
        return;
      }
      this.recordError('import', this.data.importJobId, error);
      await this.updateJob('Import failed', {
        status: 'failed',
        completedAt: new Date(),
      });
      throw error;
    }
  }

  private async importProject(
    summary: JiraProjectSummary,
    fieldNames: Record<string, string>,
  ): Promise<void> {
    await this.updateJob(`Importing project ${summary.key}`);
    let details: JiraProjectDetails = summary;
    try {
      details = await this.client.getProjectDetails(this.data.config, summary.key);
    } catch (error) {
      this.recordError('project_details', summary.id, error);
    }

    const { project, created } = await this.ensureProject(details);
    if (created) this.importedItems += 1;
    else this.skippedItems += 1;
    await this.emitProgress(`Mapping workflow for ${summary.key}`);

    let statusGroups: JiraProjectIssueTypeStatuses[] = [];
    try {
      statusGroups = await this.client.getProjectStatuses(this.data.config, summary.key);
    } catch (error) {
      this.recordError('workflow', summary.id, error);
    }
    const { statusIds, issueTypeIds } = await this.ensureWorkflowAndIssueTypes(
      project,
      statusGroups,
      created,
    );

    const sprintIds = new Map<string, string>();
    try {
      const sprints = await this.client.getSprints(this.data.config, summary.key);
      this.totalItems += sprints.length;
      for (const sprint of sprints) {
        await this.checkCancelled();
        const result = await this.ensureSprint(project, sprint);
        sprintIds.set(String(sprint.id), result.entity.id);
        result.created ? this.importedItems++ : this.skippedItems++;
      }
    } catch (error) {
      this.recordError('sprints', summary.id, error);
    }

    let issues: JiraIssue[] = [];
    try {
      issues = await this.client.getIssues(this.data.config, [summary.key]);
      this.totalItems += issues.length;
    } catch (error) {
      this.recordError('issues', summary.id, error);
      await this.emitProgress(`Project ${summary.key} imported with errors`);
      return;
    }

    const issueRepo = this.manager.getRepository(IssueEntity);
    const existingKeys = new Set(
      (await issueRepo.find({ select: { key: true } })).map((issue) => issue.key.toUpperCase()),
    );
    const issueIds = new Map<string, string>();
    const parentLinks: Array<{ issueId: string; parentExternalId: string }> = [];
    let counter = project.issueCounter;

    for (const jiraIssue of issues) {
      await this.checkCancelled();
      try {
        const mapped = this.mapper.mapIssue(jiraIssue, fieldNames);
        const existing = await this.findRecord('issue', jiraIssue.id);
        if (existing) {
          issueIds.set(jiraIssue.id, existing.localId);
          const sprintReconciled = await reconcileExistingIssueSprint(
            issueRepo,
            existing.localId,
            mapped.sprintExternalId,
            sprintIds,
          );
          if (sprintReconciled) {
            this.importedItems += 1;
            await this.emitProgress(`Reconnected ${jiraIssue.key} to its imported sprint`);
          } else {
            this.skippedItems += 1;
            await this.emitProgress(`Skipping duplicate ${jiraIssue.key}`);
          }
          await this.importCommentsAndAttachments(
            jiraIssue,
            existing.localId,
            this.data.requestedByUserId,
          );
          continue;
        }

        const keySelection = selectIssueKey(jiraIssue.key, project.key, counter, existingKeys);
        counter = keySelection.nextCounter;
        existingKeys.add(keySelection.key);

        const assigneeId = await this.findUserId(mapped.assigneeEmail);
        const reporterId =
          (await this.findUserId(mapped.reporterEmail)) ?? this.data.requestedByUserId;
        const statusId =
          (mapped.status &&
            (statusIds.get(mapped.status.id) ?? statusIds.get(mapped.status.name))) ??
          firstValue(statusIds);
        if (!statusId) throw new Error(`No workflow status available for ${jiraIssue.key}`);

        const issueTypeId = mapped.issueType
          ? (issueTypeIds.get(mapped.issueType.id) ?? issueTypeIds.get(mapped.issueType.name))
          : undefined;
        const customFields = { ...mapped.customFields };
        if (mapped.storyPoints !== null) {
          customFields['jira.story-points'] = mapped.storyPoints;
          mapped.customFieldNames['jira.story-points'] = 'Story points';
        }
        await this.ensureCustomFieldDefinitions(customFields, mapped.customFieldNames);

        const issue = issueRepo.create({
          projectId: project.id,
          key: keySelection.key,
          summary: mapped.summary,
          description: mapped.description,
          statusId,
          issueTypeId: issueTypeId ?? null,
          priority: mapped.priority,
          assigneeId,
          reporterId,
          customFields,
          sprintId: mapped.sprintExternalId
            ? (sprintIds.get(mapped.sprintExternalId) ?? null)
            : null,
          parentId: null,
          epicId: null,
          labels: mapped.labels,
          sortOrder: 0,
          dueDate: mapped.dueDate,
          startDate: null,
          percentDone:
            mapped.status && this.mapper.mapStatusCategory(mapped.status) === 'done' ? 100 : 0,
          ...(mapped.createdAt ? { createdAt: mapped.createdAt } : {}),
          ...(mapped.updatedAt ? { updatedAt: mapped.updatedAt } : {}),
        });
        const saved = await issueRepo.save(issue);
        await this.createRecord('issue', jiraIssue.id, saved.id);
        issueIds.set(jiraIssue.id, saved.id);
        if (mapped.parentExternalId) {
          parentLinks.push({ issueId: saved.id, parentExternalId: mapped.parentExternalId });
        }
        this.importedItems += 1;
        await this.emitProgress(`Imported ${jiraIssue.key}`);

        await this.importCommentsAndAttachments(jiraIssue, saved.id, reporterId);
      } catch (error) {
        this.recordError('issue', jiraIssue.key, error);
        await this.emitProgress(`Skipped ${jiraIssue.key} after an error`);
      }
    }

    for (const link of parentLinks) {
      const parentId =
        issueIds.get(link.parentExternalId) ??
        (await this.findRecord('issue', link.parentExternalId))?.localId;
      if (parentId) await issueRepo.update(link.issueId, { parentId });
    }

    project.issueCounter = counter;
    await this.manager.getRepository(ProjectEntity).save(project);
    await this.emitProgress(`Project ${summary.key} imported`);
  }

  private async ensureProject(
    jiraProject: JiraProjectDetails,
  ): Promise<{ project: ProjectEntity; created: boolean }> {
    const repo = this.manager.getRepository(ProjectEntity);
    const existingRecord = await this.findRecord('project', jiraProject.id);
    if (existingRecord) {
      const project = await repo.findOneBy({ id: existingRecord.localId });
      if (project) return { project, created: false };
      await this.manager.getRepository(ImportRecordEntity).remove(existingRecord);
    }

    const existingProjects = await repo.find({ select: { key: true } });
    const key = uniqueProjectKey(jiraProject.key, new Set(existingProjects.map((p) => p.key)));
    const defaultWorkflow = await this.manager
      .getRepository(WorkflowEntity)
      .findOneBy({ isDefault: true });
    const project = await repo.save(
      repo.create({
        key,
        name: jiraProject.name,
        description: jiraProject.description ?? null,
        workflowId: defaultWorkflow?.id ?? null,
        leadUserId: this.data.requestedByUserId,
        issueCounter: 0,
        customFields: {
          'jira.source-id': jiraProject.id,
          'jira.original-key': jiraProject.key,
          'jira.source-url': this.sourceInstance,
        },
        visibility: 'private',
      }),
    );
    await this.manager.getRepository(ProjectMemberEntity).save(
      this.manager.getRepository(ProjectMemberEntity).create({
        projectId: project.id,
        userId: this.data.requestedByUserId,
        role: 'lead',
      }),
    );
    await this.createRecord('project', jiraProject.id, project.id);
    return { project, created: true };
  }

  private async ensureWorkflowAndIssueTypes(
    project: ProjectEntity,
    groups: JiraProjectIssueTypeStatuses[],
    projectCreated: boolean,
  ): Promise<{ statusIds: Map<string, string>; issueTypeIds: Map<string, string> }> {
    const workflowRepo = this.manager.getRepository(WorkflowEntity);
    const statusRepo = this.manager.getRepository(WorkflowStatusEntity);
    const issueTypeRepo = this.manager.getRepository(IssueTypeEntity);
    const mappingRepo = this.manager.getRepository(ProjectIssueTypeEntity);
    const statusIds = new Map<string, string>();
    const issueTypeIds = new Map<string, string>();

    if (!projectCreated && project.workflowId) {
      const statuses = await statusRepo.findBy({ workflowId: project.workflowId });
      for (const status of statuses) statusIds.set(status.name, status.id);
    }

    if (groups.length > 0 && (projectCreated || statusIds.size === 0)) {
      const workflow = await workflowRepo.save(
        workflowRepo.create({ name: `${project.name} (Jira)`, isDefault: false }),
      );
      const jiraStatuses = dedupeStatuses(groups.flatMap((group) => group.statuses ?? []));
      for (const [position, jiraStatus] of jiraStatuses.entries()) {
        const category = this.mapper.mapStatusCategory(jiraStatus);
        const status = await statusRepo.save(
          statusRepo.create({
            workflowId: workflow.id,
            name: jiraStatus.name,
            category,
            color: statusColor(category),
            isInitial: position === 0,
            isTerminal: category === 'done',
            position,
          }),
        );
        statusIds.set(jiraStatus.id, status.id);
        statusIds.set(jiraStatus.name, status.id);
      }
      await this.createCompleteTransitionGraph(workflow.id, [...new Set(statusIds.values())]);
      project.workflowId = workflow.id;
      await this.manager.getRepository(ProjectEntity).save(project);
    }

    if (statusIds.size === 0 && project.workflowId) {
      const statuses = await statusRepo.findBy({ workflowId: project.workflowId });
      for (const status of statuses) statusIds.set(status.name, status.id);
    }

    for (const group of groups) {
      const slug = this.mapper.slugify(group.name).slice(0, 100);
      let issueType = await issueTypeRepo.findOneBy({ slug });
      if (!issueType) {
        issueType = await issueTypeRepo.save(
          issueTypeRepo.create({
            name: group.name,
            slug,
            icon: null,
            iconColor: null,
            iconAttachmentId: null,
            isSubtask: group.subtask ?? false,
          }),
        );
      }
      issueTypeIds.set(group.id, issueType.id);
      issueTypeIds.set(group.name, issueType.id);
      const existing = await mappingRepo.findOneBy({
        projectId: project.id,
        issueTypeId: issueType.id,
      });
      if (!existing) {
        await mappingRepo.save(
          mappingRepo.create({ projectId: project.id, issueTypeId: issueType.id }),
        );
      }
    }

    return { statusIds, issueTypeIds };
  }

  private async createCompleteTransitionGraph(
    workflowId: string,
    statusIds: string[],
  ): Promise<void> {
    const unique = [...new Set(statusIds)];
    const repo = this.manager.getRepository(WorkflowTransitionEntity);
    for (const fromStatusId of unique) {
      for (const toStatusId of unique) {
        if (fromStatusId === toStatusId) continue;
        await repo.save(
          repo.create({
            workflowId,
            fromStatusId,
            toStatusId,
            name: 'Move status',
            conditions: [],
            validators: [],
            postFunctions: [],
          }),
        );
      }
    }
  }

  private async ensureSprint(
    project: ProjectEntity,
    jiraSprint: JiraSprint,
  ): Promise<{ entity: SprintEntity; created: boolean }> {
    const repo = this.manager.getRepository(SprintEntity);
    const externalId = String(jiraSprint.id);
    const record = await this.findRecord('sprint', externalId);
    if (record) {
      const sprint = await repo.findOneBy({ id: record.localId });
      if (sprint) return { entity: sprint, created: false };
      await this.manager.getRepository(ImportRecordEntity).remove(record);
    }
    const sprint = await repo.save(
      repo.create({
        projectId: project.id,
        name: jiraSprint.name,
        goal: jiraSprint.goal ?? null,
        startDate: dateOnly(jiraSprint.startDate),
        endDate: dateOnly(jiraSprint.endDate),
        status:
          jiraSprint.state === 'closed'
            ? 'completed'
            : jiraSprint.state === 'active'
              ? 'active'
              : 'planned',
      }),
    );
    await this.createRecord('sprint', externalId, sprint.id);
    return { entity: sprint, created: true };
  }

  private async importCommentsAndAttachments(
    jiraIssue: JiraIssue,
    issueId: string,
    fallbackUserId: string,
  ): Promise<void> {
    let comments: JiraComment[] = [];
    try {
      comments = await this.client.getComments(this.data.config, jiraIssue.id);
    } catch (error) {
      this.recordError('comments', jiraIssue.key, error);
    }
    const attachments = jiraIssue.fields.attachment ?? [];
    this.totalItems += comments.length + attachments.length;

    const commentRepo = this.manager.getRepository(CommentEntity);
    for (const comment of comments) {
      await this.checkCancelled();
      try {
        if (await this.findRecord('comment', comment.id)) {
          this.skippedItems += 1;
          continue;
        }
        const authorId =
          (await this.findUserId(comment.author?.emailAddress ?? null)) ?? fallbackUserId;
        const entity = await commentRepo.save(
          commentRepo.create({
            issueId,
            authorId,
            body: this.mapper.mapComment(comment),
            ...(comment.created ? { createdAt: new Date(comment.created) } : {}),
            ...(comment.updated ? { updatedAt: new Date(comment.updated) } : {}),
          }),
        );
        await this.createRecord('comment', comment.id, entity.id);
        this.importedItems += 1;
      } catch (error) {
        this.recordError('comment', comment.id, error);
      }
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const attachmentRepo = this.manager.getRepository(AttachmentEntity);
    for (const attachment of attachments) {
      await this.checkCancelled();
      try {
        if (await this.findRecord('attachment', attachment.id)) {
          this.skippedItems += 1;
          continue;
        }
        const buffer = await this.client.downloadAttachment(this.data.config, attachment);
        const safeFilename = path.basename(attachment.filename).slice(0, 255) || 'attachment';
        const storageKey = `${randomUUID()}-${safeFilename}`;
        await fs.writeFile(path.join(UPLOAD_DIR, storageKey), buffer);
        const entity = await attachmentRepo.save(
          attachmentRepo.create({
            issueId,
            uploaderId: fallbackUserId,
            filename: safeFilename,
            mimeType: (attachment.mimeType ?? 'application/octet-stream').slice(0, 100),
            size: String(buffer.byteLength),
            storageKey,
            ...(attachment.created ? { createdAt: new Date(attachment.created) } : {}),
          }),
        );
        await this.createRecord('attachment', attachment.id, entity.id);
        this.importedItems += 1;
      } catch (error) {
        this.recordError('attachment', attachment.id, error);
      }
    }
  }

  private async ensureCustomFieldDefinitions(
    values: Record<string, unknown>,
    names: Record<string, string>,
  ): Promise<void> {
    const repo = this.manager.getRepository(CustomFieldDefinitionEntity);
    for (const [slug, value] of Object.entries(values)) {
      const existing = await repo.findOneBy({ slug, entityType: 'issue' });
      if (existing) continue;
      await repo.save(
        repo.create({
          name: names[slug] ?? slug,
          slug,
          fieldType: this.mapper.inferCustomFieldType(value),
          entityType: 'issue',
          pluginId: null,
          options: Array.isArray(value) ? { choices: [...new Set(value.map(String))] } : null,
          validation: null,
          required: false,
        }),
      );
    }
  }

  private async findUserId(email: string | null): Promise<string | null> {
    if (!email) return null;
    const result = await this.manager.query(
      'SELECT id FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email],
    );
    return result[0]?.id ?? null;
  }

  private async findRecord(type: string, externalId: string): Promise<ImportRecordEntity | null> {
    return this.manager.getRepository(ImportRecordEntity).findOneBy({
      sourceInstance: this.sourceInstance,
      externalType: type,
      externalId,
    });
  }

  private async createRecord(type: string, externalId: string, localId: string): Promise<void> {
    const repo = this.manager.getRepository(ImportRecordEntity);
    await repo.save(
      repo.create({
        importJobId: this.data.importJobId,
        sourceInstance: this.sourceInstance,
        externalType: type,
        externalId,
        localId,
      }),
    );
  }

  private async checkCancelled(): Promise<void> {
    const job = await this.manager
      .getRepository(ImportJobEntity)
      .findOneBy({ id: this.data.importJobId });
    if (!job || job.status === 'cancelled') throw new ImportCancelledError();
  }

  private recordError(itemType: string, itemId: string | undefined, error: unknown): void {
    if (this.errors.length >= MAX_RECORDED_ERRORS) return;
    this.errors.push({
      itemType,
      itemId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  private async emitProgress(currentStep: string): Promise<void> {
    await this.updateJob(currentStep);
  }

  private async updateJob(
    currentStep: string,
    overrides: Partial<ImportJobEntity> = {},
  ): Promise<void> {
    const processed = this.importedItems + this.skippedItems + this.errors.length;
    const progress =
      this.totalItems > 0 ? Math.min(99, Math.round((processed / this.totalItems) * 100)) : 0;
    const values = {
      currentStep,
      totalItems: this.totalItems,
      importedItems: this.importedItems,
      skippedItems: this.skippedItems,
      errors: this.errors,
      progress,
      ...overrides,
    };
    await this.manager.getRepository(ImportJobEntity).update(this.data.importJobId, values);
    await this.onProgress?.({
      currentStep,
      totalItems: values.totalItems,
      importedItems: values.importedItems,
      skippedItems: values.skippedItems,
      errors: values.errors,
    });
  }
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

function firstValue(map: Map<string, string>): string | undefined {
  return map.values().next().value;
}
