import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentEntity,
  BoardEntity,
  IssueEntity,
  IssueLinkEntity,
  ProjectEntity,
  ProjectMemberEntity,
  SprintEntity,
} from '@weaver/db';
import type { RequestUser } from '../auth';
import { requireTenantContext } from './tenant.context';
import { In } from 'typeorm';
import { TenantConnectionProvider } from './tenant-connection.provider';

export type ProjectAccessMode = 'read' | 'write';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async accessibleProjectIds(user: RequestUser): Promise<string[] | null> {
    if (this.isTenantAdministrator(user)) {
      return null;
    }

    const em = await this.tenantConnections.getEntityManager();
    const rows = await em
      .getRepository(ProjectEntity)
      .createQueryBuilder('project')
      .leftJoin(
        ProjectMemberEntity,
        'membership',
        'membership.project_id = project.id AND membership.user_id = :userId',
        { userId: user.userId },
      )
      .select('project.id', 'id')
      .where("project.visibility = 'public' OR membership.id IS NOT NULL")
      .getRawMany<{ id: string }>();

    return rows.map(({ id }) => id);
  }

  async assertProjectKey(
    key: string,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const project = await em.getRepository(ProjectEntity).findOneBy({ key });
    if (!project) {
      throw new NotFoundException(`Project "${key}" not found`);
    }
    await this.assertProject(project, user, mode);
  }

  async assertProjectId(
    id: string,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const project = await em.getRepository(ProjectEntity).findOneBy({ id });
    if (!project) {
      throw new NotFoundException(`Project "${id}" not found`);
    }
    await this.assertProject(project, user, mode);
  }

  async assertIssueKey(
    key: string,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const issue = await em.getRepository(IssueEntity).findOneBy({ key });
    if (!issue) {
      throw new NotFoundException(`Issue "${key}" not found`);
    }
    await this.assertProjectId(issue.projectId, user, mode);
  }

  async assertIssueIds(
    ids: string[],
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    const em = await this.tenantConnections.getEntityManager();
    const issues = await em.getRepository(IssueEntity).find({
      where: { id: In(uniqueIds) },
      select: ['id', 'projectId'],
    });
    if (issues.length !== uniqueIds.length) {
      throw new NotFoundException('One or more issues not found');
    }
    for (const projectId of new Set(issues.map(({ projectId }) => projectId))) {
      await this.assertProjectId(projectId, user, mode);
    }
  }

  async assertBoardId(
    id: string,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const board = await em.getRepository(BoardEntity).findOneBy({ id });
    if (!board) {
      throw new NotFoundException(`Board "${id}" not found`);
    }
    await this.assertProjectId(board.projectId, user, mode);
  }

  async assertSprintId(
    id: string,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const sprint = await em.getRepository(SprintEntity).findOneBy({ id });
    if (!sprint) {
      throw new NotFoundException(`Sprint "${id}" not found`);
    }
    await this.assertProjectId(sprint.projectId, user, mode);
  }

  async assertIssueLinkId(
    id: string,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const link = await em.getRepository(IssueLinkEntity).findOneBy({ id });
    if (!link) {
      throw new NotFoundException(`Issue link "${id}" not found`);
    }
    await this.assertIssueIds([link.sourceIssueId, link.targetIssueId], user, mode);
  }

  async assertAttachmentId(
    id: string,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const attachment = await em.getRepository(AttachmentEntity).findOneBy({ id });
    if (!attachment) {
      throw new NotFoundException(`Attachment "${id}" not found`);
    }
    if (attachment.issueId) {
      await this.assertIssueIds([attachment.issueId], user, mode);
      return;
    }
    if (attachment.uploaderId !== user.userId) {
      if (mode === 'read') {
        const avatars = await em.query(
          'SELECT 1 FROM public.users u JOIN public.tenant_memberships m ON m.user_id = u.id WHERE u.id = $1 AND u.avatar_url = $2 AND m.tenant_id = $3',
          [attachment.uploaderId, `/attachments/${attachment.id}/download`, requireTenantContext().tenantId],
        );
        if (avatars.length) return;
      }
      throw new ForbiddenException('Only the uploader can access an unlinked attachment');
    }
  }

  private async assertProject(
    project: ProjectEntity,
    user: RequestUser,
    mode: ProjectAccessMode,
  ): Promise<void> {
    if (this.isTenantAdministrator(user)) {
      return;
    }

    const em = await this.tenantConnections.getEntityManager();
    const membership = await em.getRepository(ProjectMemberEntity).findOneBy({
      projectId: project.id,
      userId: user.userId,
    });

    if (mode === 'read' && project.visibility === 'public') {
      return;
    }
    if (!membership || (mode === 'write' && membership.role === 'viewer')) {
      throw new ForbiddenException('Project membership is required');
    }
  }

  private isTenantAdministrator(user: RequestUser): boolean {
    return user.role === 'owner' || user.role === 'admin';
  }
}
