import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BoardEntity, IssueEntity, UserEntity } from '@weaver/db';
import {
  BoardConfig,
  BoardIssueGroup,
  BoardIssuesResponse,
  BoardSwimlaneField,
  CreateBoardDto,
  UpdateBoardDto,
} from '@weaver/shared';
import { In, Repository } from 'typeorm';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  async create(projectId: string, dto: CreateBoardDto): Promise<BoardEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(BoardEntity);

    const board = repo.create({
      projectId,
      name: dto.name,
      type: dto.type,
      config: dto.config ?? {},
    });

    return repo.save(board);
  }

  async findAll(projectId: string): Promise<BoardEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(BoardEntity);
    return repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<BoardEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(BoardEntity);
    const board = await repo.findOneBy({ id });
    if (!board) {
      throw new NotFoundException(`Board "${id}" not found`);
    }
    return board;
  }

  async findByIdWithIssues(id: string): Promise<BoardIssuesResponse> {
    const board = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);

    const issues = await issueRepo.find({
      where: { projectId: board.projectId },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });

    return {
      board,
      issues,
      groups: await this.groupIssues(issues, board.config),
    };
  }

  async update(id: string, dto: UpdateBoardDto): Promise<BoardEntity> {
    const board = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(BoardEntity);

    const { config, ...fields } = dto;
    Object.assign(board, fields);
    if (config) {
      board.config = { ...board.config, ...config };
    }
    return repo.save(board);
  }

  private async groupIssues(
    issues: IssueEntity[],
    config: BoardConfig,
  ): Promise<BoardIssueGroup[]> {
    const field = config.swimlaneField ?? 'none';
    if (field === 'none') {
      return [{ key: 'all', value: null, label: 'All issues', issues }];
    }

    const labels = await this.getGroupLabels(issues, field);
    const grouped = new Map<string, BoardIssueGroup>();

    for (const issue of issues) {
      const value = this.getGroupValue(issue, field);
      const mapKey = value ?? '__none__';
      const existing = grouped.get(mapKey);
      if (existing) {
        existing.issues.push(issue);
        continue;
      }
      grouped.set(mapKey, {
        key: `${field}:${value ?? 'none'}`,
        value,
        label: labels.get(mapKey) ?? this.getFallbackLabel(field, value),
        issues: [issue],
      });
    }

    return [...grouped.values()].sort((left, right) => this.compareGroups(field, left, right));
  }

  private getGroupValue(issue: IssueEntity, field: BoardSwimlaneField): string | null {
    if (field === 'assignee') return issue.assigneeId ?? null;
    if (field === 'priority') return issue.priority;
    if (field === 'epic') return issue.epicId ?? null;
    return null;
  }

  private async getGroupLabels(
    issues: IssueEntity[],
    field: BoardSwimlaneField,
  ): Promise<Map<string, string>> {
    if (field === 'assignee') {
      const userIds = [
        ...new Set(issues.map((issue) => issue.assigneeId).filter(Boolean)),
      ] as string[];
      const users = userIds.length > 0 ? await this.userRepo.findBy({ id: In(userIds) }) : [];
      return new Map([
        ['__none__', 'Unassigned'],
        ...users.map((user): [string, string] => [
          user.id,
          user.displayName || user.email || user.id,
        ]),
      ]);
    }

    if (field === 'epic') {
      const summaries = new Map(issues.map((issue) => [issue.id, issue.summary]));
      return new Map([
        ['__none__', 'No epic'],
        ...issues
          .map((issue) => issue.epicId)
          .filter(Boolean)
          .map((epicId): [string, string] => [
            epicId as string,
            summaries.get(epicId as string) ?? `Epic ${(epicId as string).slice(0, 8)}`,
          ]),
      ]);
    }

    return new Map();
  }

  private getFallbackLabel(field: BoardSwimlaneField, value: string | null): string {
    if (value === null) return field === 'assignee' ? 'Unassigned' : 'No epic';
    if (field === 'priority') return value.charAt(0).toUpperCase() + value.slice(1);
    return value;
  }

  private compareGroups(
    field: BoardSwimlaneField,
    left: BoardIssueGroup,
    right: BoardIssueGroup,
  ): number {
    if (left.value === null) return 1;
    if (right.value === null) return -1;
    if (field === 'priority') {
      const order = ['highest', 'high', 'medium', 'low', 'lowest'];
      return order.indexOf(left.value) - order.indexOf(right.value);
    }
    return left.label.localeCompare(right.label);
  }

  async delete(id: string): Promise<void> {
    const board = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(BoardEntity);
    await repo.remove(board);
  }
}
