import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  ActivityLogEntity,
  IssueEntity,
  ProjectEntity,
  SprintEntity,
  WorkflowStatusEntity,
} from '@weaver/db';
import {
  BurndownDataPoint,
  CreateSprintDto,
  SprintInitialScope,
  SprintStats,
  SprintSummary,
  SprintVelocity,
} from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { In, MoreThanOrEqual } from 'typeorm';

interface ReportIssueState {
  member: boolean;
  storyPoints: number;
  terminal: boolean;
}

interface ReportContext {
  initialScope: SprintInitialScope;
  activities: ActivityLogEntity[];
  stateAtStart: Map<string, ReportIssueState>;
  terminalStatusNames: Set<string>;
  reportEnd: Date;
}

@Injectable()
export class SprintsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async create(projectId: string, dto: CreateSprintDto): Promise<SprintEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    const sprint = repo.create({
      projectId,
      name: dto.name,
      goal: dto.goal ?? null,
      startDate: dto.startDate ? dto.startDate.toISOString().split('T')[0] : null,
      endDate: dto.endDate ? dto.endDate.toISOString().split('T')[0] : null,
      status: 'planned',
      capacity: dto.capacity ?? null,
    });

    return repo.save(sprint);
  }

  async findAll(projectId: string): Promise<SprintEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);
    return repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async getStats(id: string): Promise<SprintStats> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const result = await em
      .getRepository(IssueEntity)
      .createQueryBuilder('issue')
      .leftJoin(WorkflowStatusEntity, 'status', 'status.id = issue.statusId')
      .select('COUNT(issue.id)', 'issueCount')
      .addSelect('COALESCE(SUM(issue.storyPoints), 0)', 'committedPoints')
      .addSelect('SUM(CASE WHEN status.isTerminal = true THEN 1 ELSE 0 END)', 'completedCount')
      .addSelect(
        'COALESCE(SUM(CASE WHEN status.isTerminal = true THEN issue.storyPoints ELSE 0 END), 0)',
        'completedPoints',
      )
      .where('issue.sprintId = :id', { id })
      .getRawOne<{
        issueCount: string;
        committedPoints: string;
        completedCount: string;
        completedPoints: string;
      }>();

    return {
      sprintId: sprint.id,
      capacity: sprint.capacity,
      committedPoints: Number(result?.committedPoints ?? 0),
      issueCount: Number(result?.issueCount ?? 0),
      completedCount: Number(result?.completedCount ?? 0),
      completedPoints: Number(result?.completedPoints ?? 0),
    };
  }

  async findById(id: string): Promise<SprintEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);
    const sprint = await repo.findOneBy({ id });
    if (!sprint) {
      throw new NotFoundException(`Sprint "${id}" not found`);
    }
    return sprint;
  }

  async update(
    id: string,
    dto: {
      name?: string;
      goal?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      capacity?: number | null;
    },
  ): Promise<SprintEntity> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    Object.assign(sprint, dto);
    return repo.save(sprint);
  }

  async delete(id: string): Promise<void> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);
    await repo.remove(sprint);
  }

  async start(id: string): Promise<SprintEntity> {
    const sprint = await this.findById(id);

    if (sprint.status !== 'planned') {
      throw new BadRequestException(
        `Sprint can only be started from "planned" status, current status is "${sprint.status}"`,
      );
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    sprint.status = 'active';
    if (!sprint.startDate) {
      sprint.startDate = new Date().toISOString().split('T')[0];
    }

    const issueRepo = em.getRepository(IssueEntity);
    const issues = await issueRepo.find({ where: { sprintId: sprint.id } });
    sprint.initialScope = {
      capturedAt: new Date().toISOString(),
      issues: issues.map((issue) => ({
        issueId: issue.id,
        storyPoints: issue.storyPoints ?? 0,
        statusId: issue.statusId,
      })),
    };

    return repo.save(sprint);
  }

  async complete(id: string): Promise<SprintEntity> {
    const sprint = await this.findById(id);

    if (sprint.status !== 'active') {
      throw new BadRequestException(
        `Sprint can only be completed from "active" status, current status is "${sprint.status}"`,
      );
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    sprint.status = 'completed';
    if (!sprint.endDate) {
      sprint.endDate = new Date().toISOString().split('T')[0];
    }

    return repo.save(sprint);
  }

  async addIssues(id: string, issueIds: string[], userId: string): Promise<void> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);
    const uniqueIssueIds = [...new Set(issueIds)];
    const issues = await issueRepo.find({
      where: { id: In(uniqueIssueIds), projectId: sprint.projectId },
    });

    if (issues.length !== uniqueIssueIds.length) {
      throw new BadRequestException('One or more issues do not belong to this sprint project');
    }

    const changedIssues = issues.filter((issue) => issue.sprintId !== id);
    if (changedIssues.length === 0) return;

    const previousSprintIds = [
      ...new Set(
        changedIssues.map((issue) => issue.sprintId).filter((value): value is string => !!value),
      ),
    ];
    const previousSprints = previousSprintIds.length
      ? await em.getRepository(SprintEntity).find({ where: { id: In(previousSprintIds) } })
      : [];
    const sprintNames = new Map(previousSprints.map((item) => [item.id, item.name]));

    const activityRepo = em.getRepository(ActivityLogEntity);
    const activities = changedIssues.map((issue) =>
      activityRepo.create({
        issueId: issue.id,
        userId,
        action: 'updated',
        fieldName: 'sprint',
        oldValue: issue.sprintId ? (sprintNames.get(issue.sprintId) ?? issue.sprintId) : null,
        newValue: sprint.name,
      }),
    );

    for (const issue of changedIssues) issue.sprintId = id;
    await issueRepo.save(changedIssues);
    await activityRepo.save(activities);
  }

  async getBurndown(id: string): Promise<BurndownDataPoint[]> {
    const sprint = await this.findById(id);
    if (!sprint.startDate || !sprint.endDate) {
      throw new BadRequestException('Sprint reports require both a start date and an end date');
    }

    const context = await this.loadReportContext(sprint);
    const dates = this.getDateRange(sprint.startDate, sprint.endDate);
    const state = this.cloneState(context.stateAtStart);
    const activities = context.activities.filter(
      (activity) => activity.createdAt <= context.reportEnd,
    );
    let activityIndex = 0;
    const committedPoints = context.initialScope.issues.reduce(
      (sum, issue) => sum + issue.storyPoints,
      0,
    );

    return dates.map((date, index) => {
      const endOfDay = this.endOfDay(date);
      while (activityIndex < activities.length && activities[activityIndex].createdAt <= endOfDay) {
        this.applyActivity(
          state,
          activities[activityIndex],
          sprint.name,
          context.terminalStatusNames,
        );
        activityIndex += 1;
      }

      const scopedIssues = [...state.values()].filter((issue) => issue.member);
      const totalPoints = scopedIssues.reduce((sum, issue) => sum + issue.storyPoints, 0);
      const remainingPoints = scopedIssues
        .filter((issue) => !issue.terminal)
        .reduce((sum, issue) => sum + issue.storyPoints, 0);
      const progress = dates.length === 1 ? 1 : index / (dates.length - 1);

      return {
        date,
        totalPoints,
        remainingPoints,
        idealRemaining: this.round(committedPoints * (1 - progress)),
      };
    });
  }

  async getSummary(id: string): Promise<SprintSummary> {
    const sprint = await this.findById(id);
    return this.buildSummary(sprint);
  }

  async getVelocity(projectKey: string, limit: number): Promise<SprintVelocity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const project = await em.getRepository(ProjectEntity).findOneBy({ key: projectKey });
    if (!project) {
      throw new NotFoundException(`Project "${projectKey}" not found`);
    }

    const sprints = await em.getRepository(SprintEntity).find({
      where: { projectId: project.id, status: 'completed' },
      order: { endDate: 'DESC', createdAt: 'DESC' },
      take: limit,
    });
    const summaries = await Promise.all(sprints.map((sprint) => this.buildSummary(sprint)));

    return summaries.reverse().map((summary) => ({
      sprintId: summary.sprintId,
      sprintName: summary.sprintName,
      committedPoints: summary.totalPointsCommitted,
      completedPoints: summary.completedPoints,
      dates: summary.dates,
    }));
  }

  private async buildSummary(sprint: SprintEntity): Promise<SprintSummary> {
    const context = await this.loadReportContext(sprint);
    const state = this.cloneState(context.stateAtStart);
    const relevantActivities = context.activities.filter(
      (activity) => activity.createdAt <= context.reportEnd,
    );
    const addedIds = new Set<string>();
    const removedIds = new Set<string>();

    for (const activity of relevantActivities) {
      const wasMember = state.get(activity.issueId)?.member ?? false;
      this.applyActivity(state, activity, sprint.name, context.terminalStatusNames);
      const isMember = state.get(activity.issueId)?.member ?? false;
      if (activity.fieldName === 'sprint' && !wasMember && isMember) {
        addedIds.add(activity.issueId);
      }
      if (activity.fieldName === 'sprint' && wasMember && !isMember) {
        removedIds.add(activity.issueId);
      }
    }

    const initialIds = new Set(context.initialScope.issues.map((issue) => issue.issueId));
    const finalIds = new Set(
      [...state.entries()].filter(([, issue]) => issue.member).map(([issueId]) => issueId),
    );
    for (const issueId of finalIds) {
      if (!initialIds.has(issueId)) addedIds.add(issueId);
    }
    for (const issueId of initialIds) {
      if (!finalIds.has(issueId)) removedIds.add(issueId);
    }

    const scopedIssues = [...state.values()].filter((issue) => issue.member);
    const completedIssues = scopedIssues.filter((issue) => issue.terminal);
    const totalPointsCommitted = context.initialScope.issues.reduce(
      (sum, issue) => sum + issue.storyPoints,
      0,
    );
    const completedPoints = completedIssues.reduce((sum, issue) => sum + issue.storyPoints, 0);
    const carryOverPoints = scopedIssues
      .filter((issue) => !issue.terminal)
      .reduce((sum, issue) => sum + issue.storyPoints, 0);

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      dates: {
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      },
      totalIssues: scopedIssues.length,
      completedIssues: completedIssues.length,
      addedMidSprint: addedIds.size,
      removedMidSprint: removedIds.size,
      totalPointsCommitted,
      completedPoints,
      carryOverPoints,
      completionPercentage:
        scopedIssues.length === 0
          ? 0
          : this.round((completedIssues.length / scopedIssues.length) * 100),
    };
  }

  private async loadReportContext(sprint: SprintEntity): Promise<ReportContext> {
    const em = await this.tenantConnections.getEntityManager();
    const [issues, terminalStatuses] = await Promise.all([
      em.getRepository(IssueEntity).find({ where: { projectId: sprint.projectId } }),
      em.getRepository(WorkflowStatusEntity).find({ where: { isTerminal: true } }),
    ]);
    const terminalStatusIds = new Set(terminalStatuses.map((status) => status.id));
    const terminalStatusNames = new Set(terminalStatuses.map((status) => status.name));
    const initialScope = sprint.initialScope ?? {
      capturedAt: this.startOfDay(
        sprint.startDate ?? sprint.createdAt.toISOString().split('T')[0],
      ).toISOString(),
      issues: issues
        .filter((issue) => issue.sprintId === sprint.id)
        .map((issue) => ({
          issueId: issue.id,
          storyPoints: issue.storyPoints ?? 0,
          statusId: issue.statusId,
        })),
    };
    const capturedAt = new Date(initialScope.capturedAt);
    const issueIds = [
      ...new Set([
        ...issues.map((issue) => issue.id),
        ...initialScope.issues.map((issue) => issue.issueId),
      ]),
    ];
    const activities = issueIds.length
      ? await em.getRepository(ActivityLogEntity).find({
          where: { issueId: In(issueIds), createdAt: MoreThanOrEqual(capturedAt) },
          order: { createdAt: 'ASC' },
        })
      : [];
    const stateAtStart = new Map<string, ReportIssueState>();

    for (const issue of issues) {
      stateAtStart.set(issue.id, {
        member: issue.sprintId === sprint.id,
        storyPoints: issue.storyPoints ?? 0,
        terminal: terminalStatusIds.has(issue.statusId),
      });
    }

    for (const activity of [...activities].reverse()) {
      this.applyActivity(
        stateAtStart,
        { ...activity, newValue: activity.oldValue } as ActivityLogEntity,
        sprint.name,
        terminalStatusNames,
      );
    }

    for (const issue of initialScope.issues) {
      stateAtStart.set(issue.issueId, {
        member: true,
        storyPoints: issue.storyPoints,
        terminal: terminalStatusIds.has(issue.statusId),
      });
    }

    return {
      initialScope,
      activities,
      stateAtStart,
      terminalStatusNames,
      reportEnd: this.getReportEnd(sprint),
    };
  }

  private applyActivity(
    state: Map<string, ReportIssueState>,
    activity: ActivityLogEntity,
    sprintName: string,
    terminalStatusNames: Set<string>,
  ): void {
    const issue = state.get(activity.issueId) ?? {
      member: false,
      storyPoints: 0,
      terminal: false,
    };

    if (activity.fieldName === 'status') {
      issue.terminal = activity.newValue ? terminalStatusNames.has(activity.newValue) : false;
    } else if (activity.fieldName === 'storyPoints') {
      const points = Number(activity.newValue);
      issue.storyPoints = Number.isFinite(points) ? points : 0;
    } else if (activity.fieldName === 'sprint') {
      issue.member = activity.newValue === sprintName;
    }

    state.set(activity.issueId, issue);
  }

  private cloneState(state: Map<string, ReportIssueState>): Map<string, ReportIssueState> {
    return new Map([...state.entries()].map(([issueId, issue]) => [issueId, { ...issue }]));
  }

  private getDateRange(startDate: string, endDate: string): string[] {
    const start = this.startOfDay(startDate);
    const end = this.startOfDay(endDate);
    if (end < start) {
      throw new BadRequestException('Sprint end date cannot be before its start date');
    }

    const dates: string[] = [];
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      dates.push(cursor.toISOString().split('T')[0]);
    }
    return dates;
  }

  private getReportEnd(sprint: SprintEntity): Date {
    const endDate = sprint.endDate ?? new Date().toISOString().split('T')[0];
    return this.endOfDay(endDate);
  }

  private startOfDay(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private endOfDay(date: string): Date {
    return new Date(`${date}T23:59:59.999Z`);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
