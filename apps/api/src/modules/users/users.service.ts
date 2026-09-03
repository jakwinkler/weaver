import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RoleEntity, UserEntity, TenantMembershipEntity } from '@weaver/db';
import { UpdateUserDto } from '@weaver/shared';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type UpdateNotificationPreferencesDto,
} from '@weaver/shared';
import { AttachmentsService } from '../attachments/attachments.service';
import { TenantConnectionProvider } from '../../core/tenant';
import { WeaverGateway } from '../../core/websocket';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly attachmentsService: AttachmentsService,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly gateway: WeaverGateway,
  ) {}

  async findById(id: string): Promise<Omit<UserEntity, 'passwordHash'>> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: UpdateUserDto): Promise<Omit<UserEntity, 'passwordHash'>> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    const saved = await this.userRepo.save(user);
    const { passwordHash, ...rest } = saved;
    return rest;
  }

  async updateNotificationPreferences(
    id: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.notificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(user.notificationPreferences ?? {}),
      ...dto,
    };
    const saved = await this.userRepo.save(user);
    return saved.notificationPreferences;
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    const attachment = await this.attachmentsService.upload(file, userId);
    return this.update(userId, {
      avatarUrl: `/attachments/${attachment.id}/download`,
    });
  }

  async searchTenantMembers(
    tenantId: string,
    query: string,
  ): Promise<{ id: string; displayName: string; email: string; avatarUrl: string | null }[]> {
    const escapedQuery = query.trim().replace(/[\\%_]/g, '\\$&');
    const qb = this.membershipRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'u')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere(`(u.displayName ILIKE :q ESCAPE '\\' OR u.email ILIKE :q ESCAPE '\\')`, {
        q: `${escapedQuery}%`,
      })
      .orderBy('u.displayName', 'ASC', 'NULLS LAST')
      .addOrderBy('u.email', 'ASC')
      .addOrderBy('u.id', 'ASC')
      .take(10);

    const memberships = await qb.getMany();

    return memberships.map((m) => ({
      id: m.userId,
      displayName: m.user.displayName || m.user.email,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl ?? null,
    }));
  }

  async filterTenantMemberIds(tenantId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const memberships = await this.membershipRepo.findBy({
      tenantId,
      userId: In(userIds),
    });
    return new Set(memberships.map((membership) => membership.userId));
  }

  async findTenantMembers(tenantId: string): Promise<any[]> {
    const memberships = await this.membershipRepo.find({
      where: { tenantId },
      relations: ['user'],
    });

    return memberships.map((m) => ({
      id: m.userId,
      userId: m.userId,
      role: m.role,
      displayName: m.user.displayName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      createdAt: m.createdAt,
    }));
  }

  async updateMemberRole(
    tenantId: string,
    userId: string,
    role: string,
    actorRole: string,
  ): Promise<{ success: boolean }> {
    if (role !== 'owner') {
      const em = await this.tenantConnections.getEntityManager();
      if (!(await em.getRepository(RoleEntity).findOneBy({ name: role }))) {
        throw new BadRequestException(`Role "${role}" does not exist`);
      }
    }

    if (role === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('Only an owner can grant the owner role');
    }

    await this.membershipRepo.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);

      const membershipRepo = manager.getRepository(TenantMembershipEntity);
      const membership = await membershipRepo.findOneBy({ tenantId, userId });
      if (!membership) {
        throw new NotFoundException('User is not a member of this tenant');
      }

      if (membership.role === 'owner' && actorRole !== 'owner') {
        throw new ForbiddenException('Only an owner can change another owner');
      }

      if (membership.role === 'owner' && role !== 'owner') {
        const ownerCount = await membershipRepo.countBy({ tenantId, role: 'owner' });
        if (ownerCount <= 1) {
          throw new BadRequestException('A tenant must retain at least one owner');
        }
      }

      membership.role = role;
      await membershipRepo.save(membership);
    });

    this.gateway.disconnectUserFromTenant(userId, tenantId);

    return { success: true };
  }
}
