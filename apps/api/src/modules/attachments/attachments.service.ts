import { Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentEntity, IssueEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = '/tmp/weaver-uploads';

@Injectable()
export class AttachmentsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

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
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AttachmentEntity);

    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const storageKey = `${randomUUID()}-${file.originalname}`;
    const filePath = path.join(UPLOAD_DIR, storageKey);
    fs.writeFileSync(filePath, file.buffer);

    const attachment = repo.create({
      issueId,
      uploaderId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: String(file.size),
      storageKey,
    });

    return repo.save(attachment);
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

  async delete(id: string): Promise<void> {
    const attachment = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(AttachmentEntity);

    // Remove file from disk
    const filePath = path.join(UPLOAD_DIR, attachment.storageKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await repo.remove(attachment);
  }
}
