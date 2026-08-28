import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, TenantMembershipEntity } from '@weaver/db';
import { UpdateUserDto } from '@weaver/shared';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type UpdateNotificationPreferencesDto,
} from '@weaver/shared';
import { AttachmentsService } from '../attachments/attachments.service';

const VALID_ROLES = ['owner', 'admin', 'member', 'viewer'];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly attachmentsService: AttachmentsService,
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

  async searchTenantMembers(tenantId: string, query: string): Promise<any[]> {
    const qb = this.membershipRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'u')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('(u.displayName ILIKE :q OR u.email ILIKE :q)', { q: `${query}%` })
      .take(10);

    const memberships = await qb.getMany();

    return memberships.map((m) => ({
      id: m.userId,
      userId: m.userId,
      role: m.role,
      displayName: m.user.displayName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
    }));
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
  ): Promise<{ success: boolean }> {
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException(
        `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`,
      );
    }

    const membership = await this.membershipRepo.findOneBy({ tenantId, userId });
    if (!membership) {
      throw new NotFoundException('User is not a member of this tenant');
    }

    membership.role = role;
    await this.membershipRepo.save(membership);
    return { success: true };
  }
}
