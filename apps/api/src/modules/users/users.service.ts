import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, TenantMembershipEntity } from '@weaver/db';
import { UpdateUserDto } from '@weaver/shared';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
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

  async findTenantMembers(tenantId: string): Promise<any[]> {
    const memberships = await this.membershipRepo.find({
      where: { tenantId },
      relations: ['user'],
    });

    return memberships.map((m) => ({
      userId: m.userId,
      role: m.role,
      displayName: m.user.displayName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      createdAt: m.createdAt,
    }));
  }
}
