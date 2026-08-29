import { randomBytes, createHash } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from '@weaver/db';
import {
  API_KEY_PREFIX,
  type ApiKey,
  type ApiKeyScope,
  type CreateApiKeyDto,
  type CreatedApiKey,
} from '@weaver/shared';
import type { RequestUser } from '../../core/auth';

const MASKED_API_KEY = `${API_KEY_PREFIX}${'•'.repeat(12)}`;

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
  ) {}

  async create(user: RequestUser, dto: CreateApiKeyDto): Promise<CreatedApiKey> {
    const plainKey = `${API_KEY_PREFIX}${randomBytes(30).toString('base64url')}`;
    const entity = this.apiKeyRepo.create({
      tenantId: user.tenantId,
      userId: user.userId,
      name: dto.name,
      keyHash: this.hash(plainKey),
      scopes: dto.scopes,
      expiresAt: dto.expiresAt ?? null,
      lastUsedAt: null,
    });
    const saved = await this.apiKeyRepo.save(entity);

    return {
      ...this.serialize(saved),
      key: plainKey,
    };
  }

  async findAll(user: RequestUser): Promise<ApiKey[]> {
    const keys = await this.apiKeyRepo.find({
      where: { tenantId: user.tenantId, userId: user.userId },
      order: { createdAt: 'DESC' },
    });

    return keys.map((key) => this.serialize(key));
  }

  async delete(user: RequestUser, id: string): Promise<void> {
    const result = await this.apiKeyRepo.delete({
      id,
      tenantId: user.tenantId,
      userId: user.userId,
    });

    if (!result.affected) {
      throw new NotFoundException('API key not found');
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private serialize(entity: ApiKeyEntity): ApiKey {
    return {
      id: entity.id,
      name: entity.name,
      maskedKey: MASKED_API_KEY,
      scopes: entity.scopes as ApiKeyScope[],
      expiresAt: entity.expiresAt?.toISOString() ?? null,
      lastUsedAt: entity.lastUsedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
