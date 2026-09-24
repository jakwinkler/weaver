import { Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentCleanupEntity, AttachmentEntity, IssueEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { randomUUID } from 'crypto';
import { StorageService } from '../../core/storage';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly storage: StorageService,
  ) {}

  private async resolveIssueId(issueKey: string): Promise<string> {
    const em = await this.tenantConnections.getEntityManager();
    const issue = await em.getRepository(IssueEntity).findOneBy({ key: issueKey });
    if (!issue) {
      throw new NotFoundException(`Issue "${issueKey}" not found`);
    }
    return issue.id;
  }

  async create(
    issueKey: string,
    file: Express.Multer.File,
    uploaderId: string,
  ): Promise<AttachmentEntity> {
    const issueId = await this.resolveIssueId(issueKey);
    return this.save(file, uploaderId, issueId);
  }

  async upload(file: Express.Multer.File, uploaderId: string): Promise<AttachmentEntity> {
    return this.save(file, uploaderId, null);
  }

  private async save(
    file: Express.Multer.File,
    uploaderId: string,
    issueId: string | null,
  ): Promise<AttachmentEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AttachmentEntity);
    const storageKey = randomUUID();
    await this.storage.put(storageKey, file.buffer);

    const attachment = repo.create({
      issueId,
      uploaderId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: String(file.size),
      storageKey,
    });

    try {
      return await repo.save(attachment);
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  async findByIssue(issueKey: string): Promise<AttachmentEntity[]> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AttachmentEntity);

    return repo.find({
      where: { issueId },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<AttachmentEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AttachmentEntity);
    const attachment = await repo.findOneBy({ id });
    if (!attachment) {
      throw new NotFoundException(`Attachment "${id}" not found`);
    }
    return attachment;
  }

  async getData(storageKey: string): Promise<Buffer> {
    try {
      return await this.storage.get(storageKey);
    } catch {
      throw new NotFoundException('Stored file not found');
    }
  }

  async delete(id: string, issueKey: string): Promise<void> {
    await this.tenantConnections.runInTenantTransaction(async (manager) => {
      const issueId = await this.resolveIssueId(issueKey);
      const attachment = await this.findById(id);
      if (attachment.issueId !== issueId)
        throw new NotFoundException('Attachment not found on this issue');
      await manager.getRepository(AttachmentCleanupEntity).insert({
        storageKey: attachment.storageKey,
        attachmentId: attachment.id,
      });
      await manager.getRepository(AttachmentEntity).remove(attachment);
    });
  }
}
