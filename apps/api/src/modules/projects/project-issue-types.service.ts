import { Injectable } from '@nestjs/common';
import { ProjectIssueTypeEntity, IssueTypeEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { In } from 'typeorm';

@Injectable()
export class ProjectIssueTypesService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async findByProject(projectId: string): Promise<IssueTypeEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const pitRepo = em.getRepository(ProjectIssueTypeEntity);

    const mappings = await pitRepo.find({
      where: { projectId },
      relations: ['issueType'],
    });

    if (mappings.length === 0) {
      const itRepo = em.getRepository(IssueTypeEntity);
      return itRepo.find({ order: { name: 'ASC' } });
    }

    return mappings.map((m) => m.issueType);
  }

  async setForProject(
    projectId: string,
    issueTypeIds: string[],
  ): Promise<IssueTypeEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const pitRepo = em.getRepository(ProjectIssueTypeEntity);

    await pitRepo.delete({ projectId });

    if (issueTypeIds.length > 0) {
      const entries = issueTypeIds.map((issueTypeId) =>
        pitRepo.create({ projectId, issueTypeId }),
      );
      await pitRepo.save(entries);
    }

    return this.findByProject(projectId);
  }
}
