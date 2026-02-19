import { Injectable, NotFoundException } from '@nestjs/common';
import { BoardEntity, IssueEntity } from '@weaver/db';
import { CreateBoardDto } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class BoardsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

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

  async findByIdWithIssues(id: string): Promise<{ board: BoardEntity; issues: IssueEntity[] }> {
    const board = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);

    const issues = await issueRepo.find({
      where: { projectId: board.projectId },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });

    return { board, issues };
  }

  async update(id: string, dto: { name?: string; type?: string; config?: Record<string, unknown> }): Promise<BoardEntity> {
    const board = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(BoardEntity);

    Object.assign(board, dto);
    return repo.save(board);
  }

  async delete(id: string): Promise<void> {
    const board = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(BoardEntity);
    await repo.remove(board);
  }
}
