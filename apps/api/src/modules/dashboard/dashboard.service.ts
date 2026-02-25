import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../../core/tenant';
import { UsersService } from '../users';
import {
  ProjectEntity,
  IssueEntity,
  WorkflowStatusEntity,
  ActivityLogEntity,
} from '@weaver/db';
import { In, Not } from 'typeorm';

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly usersService: UsersService,
  ) {}

  async getDashboard(userId: string) {
    const em = await this.tenantConnections.getEntityManager();

    const [stats, myIssues, recentActivity, projectOverviews] =
      await Promise.all([
        this.getStats(em, userId),
        this.getMyIssues(em, userId),
        this.getRecentActivity(em),
        this.getProjectOverviews(em, userId),
      ]);

    return { stats, myIssues, recentActivity, projectOverviews };
  }

  private async getStats(em: any, userId: string) {
    const projectRepo = em.getRepository(ProjectEntity);
    const issueRepo = em.getRepository(IssueEntity);
    const statusRepo = em.getRepository(WorkflowStatusEntity);

    const terminalStatuses = await statusRepo.find({
      where: { isTerminal: true },
      select: ['id'],
    });
    const terminalIds = terminalStatuses.map((s: any) => s.id);

    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [totalProjects, myOpenIssues, overdueIssues, completedThisWeek] =
      await Promise.all([
        projectRepo.count(),

        terminalIds.length > 0
          ? issueRepo
              .createQueryBuilder('issue')
              .where('issue.assignee_id = :userId', { userId })
              .andWhere('issue.status_id NOT IN (:...terminalIds)', {
                terminalIds,
              })
              .getCount()
          : issueRepo.count({ where: { assigneeId: userId } }),

        terminalIds.length > 0
          ? issueRepo
              .createQueryBuilder('issue')
              .where('issue.due_date < :today', { today })
              .andWhere('issue.status_id NOT IN (:...terminalIds)', {
                terminalIds,
              })
              .getCount()
          : issueRepo
              .createQueryBuilder('issue')
              .where('issue.due_date < :today', { today })
              .getCount(),

        terminalIds.length > 0
          ? issueRepo
              .createQueryBuilder('issue')
              .where('issue.status_id IN (:...terminalIds)', { terminalIds })
              .andWhere('issue.updated_at >= :weekStart', { weekStart })
              .getCount()
          : 0,
      ]);

    return { totalProjects, myOpenIssues, overdueIssues, completedThisWeek };
  }

  private async getMyIssues(em: any, userId: string) {
    const issueRepo = em.getRepository(IssueEntity);
    const statusRepo = em.getRepository(WorkflowStatusEntity);

    const terminalStatuses = await statusRepo.find({
      where: { isTerminal: true },
      select: ['id'],
    });
    const terminalIds = terminalStatuses.map((s: any) => s.id);

    // Use find() instead of QueryBuilder to avoid TypeORM orderBy+leftJoinAndSelect bugs
    const whereConditions: any = { assigneeId: userId };
    if (terminalIds.length > 0) {
      whereConditions.statusId = Not(In(terminalIds));
    }

    const issues = await issueRepo.find({
      where: whereConditions,
      relations: ['project', 'issueType'],
      order: { updatedAt: 'DESC' },
      take: 30,
    });

    // Sort by priority in application code
    const priorityOrder: Record<string, number> = {
      highest: 1,
      high: 2,
      medium: 3,
      low: 4,
      lowest: 5,
    };
    issues.sort((a: any, b: any) => {
      const pa = priorityOrder[a.priority] ?? 6;
      const pb = priorityOrder[b.priority] ?? 6;
      if (pa !== pb) return pa - pb;
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });
    issues.splice(15);

    // Resolve status names/colors
    const statusIds = [...new Set(issues.map((i: any) => i.statusId).filter(Boolean))];
    const statuses =
      statusIds.length > 0
        ? await statusRepo.find({ where: { id: In(statusIds) } })
        : [];
    const statusMap = new Map(statuses.map((s: any) => [s.id, s]));

    return issues.map((issue: any) => {
      const status = statusMap.get(issue.statusId);
      return {
        key: issue.key,
        summary: issue.summary,
        priority: issue.priority,
        dueDate: issue.dueDate,
        projectKey: issue.project?.key,
        projectName: issue.project?.name,
        issueTypeName: issue.issueType?.name ?? null,
        status: status
          ? { name: status.name, color: status.color }
          : { name: 'Unknown', color: '#888888' },
      };
    });
  }

  private async getRecentActivity(em: any) {
    const activityRepo = em.getRepository(ActivityLogEntity);
    const issueRepo = em.getRepository(IssueEntity);

    const activities = await activityRepo.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });

    if (activities.length === 0) return [];

    // Batch-resolve issue keys
    const issueIds = [...new Set(activities.map((a: any) => a.issueId))];
    const issues =
      issueIds.length > 0
        ? await issueRepo.find({
            where: { id: In(issueIds) },
            select: ['id', 'key', 'summary'],
          })
        : [];
    const issueMap = new Map(issues.map((i: any) => [i.id, i]));

    // Batch-resolve user names
    const userIds = [...new Set(activities.map((a: any) => a.userId))];
    const userMap = new Map<string, string>();
    for (const uid of userIds) {
      try {
        const user = await this.usersService.findById(uid);
        userMap.set(uid, user.displayName || user.email);
      } catch {
        userMap.set(uid, 'Unknown user');
      }
    }

    return activities.map((a: any) => {
      const issue = issueMap.get(a.issueId);
      return {
        action: a.action,
        fieldName: a.fieldName,
        oldValue: a.oldValue,
        newValue: a.newValue,
        createdAt: a.createdAt,
        issueKey: issue?.key ?? null,
        issueSummary: issue?.summary ?? null,
        userDisplayName: userMap.get(a.userId) ?? 'Unknown user',
      };
    });
  }

  private async getProjectOverviews(em: any, userId: string) {
    const projectRepo = em.getRepository(ProjectEntity);
    const issueRepo = em.getRepository(IssueEntity);
    const statusRepo = em.getRepository(WorkflowStatusEntity);

    const projects = await projectRepo.find({
      order: { updatedAt: 'DESC' },
    });

    if (projects.length === 0) return [];

    const terminalStatuses = await statusRepo.find({
      where: { isTerminal: true },
      select: ['id'],
    });
    const terminalIds = terminalStatuses.map((s: any) => s.id);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // Total issues per project
    const totalCounts: { project_id: string; count: string }[] = await issueRepo
      .createQueryBuilder('issue')
      .select('issue.project_id', 'project_id')
      .addSelect('COUNT(*)', 'count')
      .groupBy('issue.project_id')
      .getRawMany();
    const totalMap = new Map(
      totalCounts.map((r) => [r.project_id, parseInt(r.count, 10)]),
    );

    // Open issues per project (not terminal)
    let openMap = new Map<string, number>();
    if (terminalIds.length > 0) {
      const openCounts: { project_id: string; count: string }[] = await issueRepo
        .createQueryBuilder('issue')
        .select('issue.project_id', 'project_id')
        .addSelect('COUNT(*)', 'count')
        .where('issue.status_id NOT IN (:...terminalIds)', { terminalIds })
        .groupBy('issue.project_id')
        .getRawMany();
      openMap = new Map(
        openCounts.map((r) => [r.project_id, parseInt(r.count, 10)]),
      );
    } else {
      openMap = new Map(totalMap);
    }

    // My open issues per project (assigned to user, not terminal)
    let myOpenMap = new Map<string, number>();
    if (terminalIds.length > 0) {
      const myOpenCounts: { project_id: string; count: string }[] =
        await issueRepo
          .createQueryBuilder('issue')
          .select('issue.project_id', 'project_id')
          .addSelect('COUNT(*)', 'count')
          .where('issue.assignee_id = :userId', { userId })
          .andWhere('issue.status_id NOT IN (:...terminalIds)', { terminalIds })
          .groupBy('issue.project_id')
          .getRawMany();
      myOpenMap = new Map(
        myOpenCounts.map((r) => [r.project_id, parseInt(r.count, 10)]),
      );
    } else {
      const myOpenCounts: { project_id: string; count: string }[] =
        await issueRepo
          .createQueryBuilder('issue')
          .select('issue.project_id', 'project_id')
          .addSelect('COUNT(*)', 'count')
          .where('issue.assignee_id = :userId', { userId })
          .groupBy('issue.project_id')
          .getRawMany();
      myOpenMap = new Map(
        myOpenCounts.map((r) => [r.project_id, parseInt(r.count, 10)]),
      );
    }

    // My done issues per project (assigned to user, terminal, this week)
    let myDoneMap = new Map<string, number>();
    if (terminalIds.length > 0) {
      const myDoneCounts: { project_id: string; count: string }[] =
        await issueRepo
          .createQueryBuilder('issue')
          .select('issue.project_id', 'project_id')
          .addSelect('COUNT(*)', 'count')
          .where('issue.assignee_id = :userId', { userId })
          .andWhere('issue.status_id IN (:...terminalIds)', { terminalIds })
          .andWhere('issue.updated_at >= :weekStart', { weekStart })
          .groupBy('issue.project_id')
          .getRawMany();
      myDoneMap = new Map(
        myDoneCounts.map((r) => [r.project_id, parseInt(r.count, 10)]),
      );
    }

    return projects.map((p: any) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      iconAttachmentId: p.iconAttachmentId,
      totalIssues: totalMap.get(p.id) ?? 0,
      openIssues: openMap.get(p.id) ?? 0,
      myOpenIssues: myOpenMap.get(p.id) ?? 0,
      myDoneIssues: myDoneMap.get(p.id) ?? 0,
      updatedAt: p.updatedAt,
    }));
  }
}
