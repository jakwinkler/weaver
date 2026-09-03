import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FormEntity, FormSubmissionEntity, UserEntity } from '@weaver/db';
import type {
  CreateFormDto,
  CreateIssueDto,
  FormFieldDefinition,
  PublicFormSubmissionDto,
  UpdateFormDto,
} from '@weaver/shared';
import { Repository } from 'typeorm';
import { getTenantContext, TenantConnectionProvider, TenantService } from '../../core/tenant';
import { IssuesService } from '../issues';
import { MailService } from '../mail';
import { NotificationsService } from '../notifications';
import { ProjectsService, ProjectIssueTypesService } from '../projects';

export interface FormView extends FormEntity {
  tenantSlug: string;
}

type SubmissionIssueData = CreateIssueDto;

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly tenantService: TenantService,
    private readonly projectsService: ProjectsService,
    private readonly projectIssueTypesService: ProjectIssueTypesService,
    private readonly issuesService: IssuesService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async create(projectKey: string, dto: CreateFormDto, userId: string): Promise<FormView> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(FormEntity);

    await this.ensureSlugAvailable(dto.slug);
    await this.validateIssueType(project.id, dto.issueDefaults.issueTypeId);

    const form = repo.create({
      projectId: project.id,
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      fields: dto.fields,
      issueDefaults: this.normalizeDefaults(dto.issueDefaults),
      active: dto.active,
      createdBy: userId,
    });

    return this.withTenantSlug(await repo.save(form));
  }

  async findAll(projectKey: string): Promise<FormView[]> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();
    const forms = await em.getRepository(FormEntity).find({
      where: { projectId: project.id },
      order: { createdAt: 'DESC' },
    });
    const tenantSlug = await this.getTenantSlug();
    return forms.map((form) => Object.assign(form, { tenantSlug }));
  }

  async findOne(projectKey: string, formId: string): Promise<FormView> {
    const form = await this.findProjectForm(projectKey, formId);
    return this.withTenantSlug(form);
  }

  async update(projectKey: string, formId: string, dto: UpdateFormDto): Promise<FormView> {
    const form = await this.findProjectForm(projectKey, formId);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(FormEntity);

    if (dto.slug && dto.slug !== form.slug) {
      await this.ensureSlugAvailable(dto.slug, form.id);
    }
    if (dto.issueDefaults?.issueTypeId !== undefined) {
      await this.validateIssueType(form.projectId, dto.issueDefaults.issueTypeId);
    }

    if (dto.name !== undefined) form.name = dto.name;
    if (dto.slug !== undefined) form.slug = dto.slug;
    if (dto.description !== undefined) form.description = dto.description;
    if (dto.fields !== undefined) form.fields = dto.fields;
    if (dto.issueDefaults !== undefined)
      form.issueDefaults = this.normalizeDefaults(dto.issueDefaults);
    if (dto.active !== undefined) form.active = dto.active;

    return this.withTenantSlug(await repo.save(form));
  }

  async delete(projectKey: string, formId: string): Promise<void> {
    const form = await this.findProjectForm(projectKey, formId);
    const em = await this.tenantConnections.getEntityManager();
    await em.getRepository(FormEntity).remove(form);
  }

  async findSubmissions(
    projectKey: string,
    formId: string,
    limit = 20,
  ): Promise<FormSubmissionEntity[]> {
    const form = await this.findProjectForm(projectKey, formId);
    const em = await this.tenantConnections.getEntityManager();
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
    return em.getRepository(FormSubmissionEntity).find({
      where: { formId: form.id },
      order: { submittedAt: 'DESC' },
      take: safeLimit,
    });
  }

  async getPublicForm(formSlug: string): Promise<FormEntity> {
    const form = await this.findActivePublicForm(formSlug);
    return form;
  }

  async submitPublicForm(
    formSlug: string,
    dto: PublicFormSubmissionDto,
  ): Promise<{ submissionId: string; issueKey: string }> {
    const form = await this.findActivePublicForm(formSlug);
    const issueData = this.mapSubmission(form.fields, dto.values, form.issueDefaults);
    const reporterId = form.project.leadUserId || form.createdBy;

    const issue = await this.issuesService.create(form.project.key, issueData, reporterId);
    const em = await this.tenantConnections.getEntityManager();
    const submissionRepo = em.getRepository(FormSubmissionEntity);
    const submission = await submissionRepo.save(
      submissionRepo.create({
        formId: form.id,
        issueId: issue.id,
        issueKey: issue.key,
      }),
    );

    await this.notifyProjectLead(form, issue.key, issue.summary);

    return { submissionId: submission.id, issueKey: issue.key };
  }

  private async findProjectForm(projectKey: string, formId: string): Promise<FormEntity> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();
    const form = await em.getRepository(FormEntity).findOneBy({
      id: formId,
      projectId: project.id,
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  private async findActivePublicForm(formSlug: string): Promise<FormEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const form = await em.getRepository(FormEntity).findOne({
      where: { slug: formSlug, active: true },
      relations: ['project'],
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  private async ensureSlugAvailable(slug: string, excludingId?: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const existing = await em.getRepository(FormEntity).findOneBy({ slug });
    if (existing && existing.id !== excludingId) {
      throw new ConflictException(`Form slug "${slug}" already exists`);
    }
  }

  private async validateIssueType(projectId: string, issueTypeId?: string): Promise<void> {
    if (!issueTypeId) return;
    const availableTypes = await this.projectIssueTypesService.findByProject(projectId);
    if (!availableTypes.some((issueType) => issueType.id === issueTypeId)) {
      throw new BadRequestException('Default issue type is not available for this project');
    }
  }

  private normalizeDefaults(
    defaults: CreateFormDto['issueDefaults'],
  ): CreateFormDto['issueDefaults'] {
    return {
      ...defaults,
      labels: [...new Set(defaults.labels.map((label) => label.trim()).filter(Boolean))],
    };
  }

  private mapSubmission(
    fields: FormFieldDefinition[],
    values: Record<string, string>,
    defaults: FormEntity['issueDefaults'],
  ): SubmissionIssueData {
    const knownFieldIds = new Set(fields.map((field) => field.id));
    const unknownField = Object.keys(values).find((fieldId) => !knownFieldIds.has(fieldId));
    if (unknownField) {
      throw new BadRequestException(`Unknown form field "${unknownField}"`);
    }

    let summary = '';
    let description: Record<string, unknown> | undefined;
    const labels = [...(defaults.labels || [])];
    const customFields: Record<string, unknown> = {};

    for (const field of fields) {
      const value = (values[field.id] || '').trim();
      if ((field.required || field.mapping === 'summary') && !value) {
        throw new BadRequestException(`${field.label} is required`);
      }
      if (!value) continue;

      this.validateFieldValue(field, value);

      if (field.mapping === 'summary') summary = value;
      if (field.mapping === 'description') description = this.toRichTextDocument(value);
      if (field.mapping === 'labels') {
        labels.push(
          ...value
            .split(',')
            .map((label) => label.trim())
            .filter(Boolean),
        );
      }
      if (field.mapping === 'custom-field' && field.customFieldKey) {
        customFields[field.customFieldKey] = value;
      }
    }

    if (!summary) throw new BadRequestException('Issue summary is required');

    return {
      summary,
      description,
      issueTypeId: defaults.issueTypeId,
      priority: defaults.priority || 'medium',
      labels: [...new Set(labels)].slice(0, 50),
      customFields,
      percentDone: 0,
    };
  }

  private validateFieldValue(field: FormFieldDefinition, value: string): void {
    const maxLength = field.type === 'textarea' ? 10_000 : field.type === 'email' ? 320 : 500;
    if (value.length > maxLength) {
      throw new BadRequestException(`${field.label} is too long`);
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new BadRequestException(`${field.label} must be a valid email address`);
    }
    if (field.type === 'select' && !field.options?.includes(value)) {
      throw new BadRequestException(`${field.label} contains an invalid selection`);
    }
  }

  private toRichTextDocument(value: string): Record<string, unknown> {
    const content = value.split(/\n+/).map((paragraph) => ({
      type: 'paragraph',
      content: paragraph ? [{ type: 'text', text: paragraph }] : [],
    }));
    return { type: 'doc', content };
  }

  private async notifyProjectLead(
    form: FormEntity,
    issueKey: string,
    summary: string,
  ): Promise<void> {
    const leadUserId = form.project.leadUserId;
    if (!leadUserId) return;

    try {
      await this.notificationsService.create(
        leadUserId,
        'form_submission',
        `New form submission: ${issueKey}`,
        { issueKey, formId: form.id, formName: form.name },
      );
    } catch (error) {
      this.logger.warn(`Unable to create form submission notification: ${String(error)}`);
    }

    try {
      const lead = await this.userRepo.findOneBy({ id: leadUserId });
      const tenant = getTenantContext();
      if (lead && tenant) {
        await this.mailService.enqueueNotification({
          tenantId: tenant.tenantId,
          userId: lead.id,
          preference: 'emailOnAssign',
          template: 'form-submission',
          context: { formName: form.name, issueKey, summary, issueUrl: this.mailService.issueUrl(issueKey) },
        });
      }
    } catch (error) {
      this.logger.warn(`Unable to email form submission notification: ${String(error)}`);
    }
  }

  private async getTenantSlug(): Promise<string> {
    const context = getTenantContext();
    if (!context) throw new Error('Tenant context is not available');
    const tenant = await this.tenantService.findById(context.tenantId);
    if (!tenant) throw new NotFoundException('Organization not found');
    return tenant.slug;
  }

  private async withTenantSlug(form: FormEntity): Promise<FormView> {
    return Object.assign(form, { tenantSlug: await this.getTenantSlug() });
  }
}
