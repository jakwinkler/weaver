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
import type { NotificationPreferences, UpdateNotificationPreferencesDto } from '@weaver/shared';
import { AttachmentsService } from '../attachments/attachments.service';
import { MemberVisibilityService, TenantConnectionProvider } from '../../core/tenant';
import type { RequestUser } from '../../core/auth/current-user.decorator';
import { WeaverGateway } from '../../core/websocket';
import { mergeNotificationPreferences } from './notification-preferences';

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
    private readonly memberVisibility: MemberVisibilityService,
  ) {}

  async findById(id: string): Promise<Omit<UserEntity, 'passwordHash' | 'sessionVersion'>> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { passwordHash, sessionVersion, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: UpdateUserDto): Promise<Omit<UserEntity, 'passwordHash' | 'sessionVersion'>> {
    // Write only the changed columns: save() would also write every other column back as
    // it was loaded, undoing a concurrent change to it.
    const changes: Partial<Pick<UserEntity, 'displayName' | 'avatarUrl'>> = {};
    if (dto.displayName !== undefined) changes.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) changes.avatarUrl = dto.avatarUrl;

    if (Object.keys(changes).length > 0) {
      const { affected } = await this.userRepo.update({ id }, changes);
      if (!affected) {
        throw new NotFoundException('User not found');
      }
    }
    return this.findById(id);
  }

  async updateNotificationPreferences(
    id: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const preferences = await mergeNotificationPreferences(this.userRepo, id, dto);
    if (!preferences) {
      throw new NotFoundException('User not found');
    }
    return preferences;
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<Omit<UserEntity, 'passwordHash' | 'sessionVersion'>> {
    const bytes = file.buffer;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const gif = /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'));
    const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (bytes.length > 5 * 1024 * 1024 || ![png, jpeg, gif, webp].some(Boolean)) {
      throw new BadRequestException('Avatar must be a PNG, JPEG, GIF or WebP image up to 5 MB');
    }
    const attachment = await this.attachmentsService.upload(file, userId);
    return this.update(userId, {
      avatarUrl: `/attachments/${attachment.id}/download`,
    });
  }

  async searchTenantMembers(
    user: RequestUser,
    query: string,
  ): Promise<{ id: string; displayName: string; email: string; avatarUrl: string | null }[]> {
    const escapedQuery = query.trim().replace(/[\\%_]/g, '\\$&');
    const qb = this.membershipRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'u')
      .where('m.tenantId = :tenantId', { tenantId: user.tenantId })
      .andWhere(`(u.displayName ILIKE :q ESCAPE '\\' OR u.email ILIKE :q ESCAPE '\\')`, {
        q: `${escapedQuery}%`,
      })
      .orderBy('u.displayName', 'ASC', 'NULLS LAST')
      .addOrderBy('u.email', 'ASC')
      .addOrderBy('u.id', 'ASC')
      .take(10);

    const visible = await this.memberVisibility.visibleMemberIds(user);
    if (visible !== null) qb.andWhere('m.userId IN (:...visibleIds)', { visibleIds: visible });
    const memberships = await qb.getMany();

    return memberships.map((m) => ({
      id: m.userId,
      displayName: m.user.displayName || m.user.email,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl ?? null,
    }));
  }

  async filterProjectMemberIds(tenantId: string, projectId: string, userIds: string[]): Promise<Set<string>> {
    return this.memberVisibility.projectRecipientIds(tenantId, projectId, userIds);
  }

  async findTenantMembers(user: RequestUser): Promise<any[]> {
    const visible = await this.memberVisibility.visibleMemberIds(user);
    const memberships = await this.membershipRepo.find({
      where: { tenantId: user.tenantId, ...(visible === null ? {} : { userId: In(visible) }) },
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
