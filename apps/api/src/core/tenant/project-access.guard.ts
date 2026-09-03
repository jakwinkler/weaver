import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestUser } from '../auth';
import {
  ProjectAccessMode,
  ProjectAccessService,
} from './project-access.service';

type ProjectAccessTarget =
  | 'project-key'
  | 'project-id'
  | 'issue-key'
  | 'issue-id'
  | 'issue-ids'
  | 'board-id'
  | 'sprint-id'
  | 'issue-link-body'
  | 'issue-link-id'
  | 'attachment-id';

interface ProjectAccessRequirement {
  target: ProjectAccessTarget;
  mode: ProjectAccessMode;
}

const PROJECT_ACCESS = 'project-access';

export const RequireProjectAccess = (
  target: ProjectAccessTarget,
  mode: ProjectAccessMode = 'read',
) => SetMetadata(PROJECT_ACCESS, { target, mode } satisfies ProjectAccessRequirement);

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<ProjectAccessRequirement>(
      PROJECT_ACCESS,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: RequestUser }>();
    const { user } = request;
    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, string | undefined>;
    const body = request.body as Record<string, any> | undefined;

    switch (requirement.target) {
      case 'project-key':
        await this.projectAccess.assertProjectKey(
          this.required(params.projectKey ?? params.key, 'project key'),
          user,
          requirement.mode,
        );
        break;
      case 'project-id':
        await this.projectAccess.assertProjectId(
          this.required(query.projectId ?? body?.projectId, 'project ID'),
          user,
          requirement.mode,
        );
        break;
      case 'issue-key':
        await this.projectAccess.assertIssueKey(
          this.required(params.issueKey, 'issue key'),
          user,
          requirement.mode,
        );
        break;
      case 'issue-id':
        await this.projectAccess.assertIssueIds(
          [this.required(params.issueId, 'issue ID')],
          user,
          requirement.mode,
        );
        break;
      case 'issue-ids':
        await this.projectAccess.assertIssueIds(
          (body?.issues ?? []).map((issue: { id: string }) => issue.id),
          user,
          requirement.mode,
        );
        break;
      case 'board-id':
        await this.projectAccess.assertBoardId(
          this.required(params.id, 'board ID'),
          user,
          requirement.mode,
        );
        break;
      case 'sprint-id':
        await this.projectAccess.assertSprintId(
          this.required(params.id, 'sprint ID'),
          user,
          requirement.mode,
        );
        break;
      case 'issue-link-body':
        await this.projectAccess.assertIssueIds(
          [
            this.required(body?.sourceIssueId, 'source issue ID'),
            this.required(body?.targetIssueId, 'target issue ID'),
          ],
          user,
          requirement.mode,
        );
        break;
      case 'issue-link-id':
        await this.projectAccess.assertIssueLinkId(
          this.required(params.id, 'issue link ID'),
          user,
          requirement.mode,
        );
        break;
      case 'attachment-id':
        await this.projectAccess.assertAttachmentId(
          this.required(params.id, 'attachment ID'),
          user,
          requirement.mode,
        );
        break;
    }

    return true;
  }

  private required(value: string | undefined, label: string): string {
    if (!value) {
      throw new BadRequestException(`${label} is required`);
    }
    return value;
  }
}
