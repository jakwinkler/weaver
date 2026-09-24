import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { z } from 'zod';
import {
  JwtAuthGuard,
  CurrentUser, RequestUser, AdminGuard,
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { RolesService } from './roles.service';
import { Audit } from '../audit';
import { ZodValidationPipe } from '../../common';

const permissionsSchema = z
  .record(
    z.string().min(1).max(100).regex(/^(\*|[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*)$/),
    z.boolean(),
  )
  .refine((permissions) => Object.keys(permissions).length <= 100, {
    message: 'A role cannot contain more than 100 permissions',
  });

const createRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(50).regex(/^[a-z][a-z0-9_-]*$/),
    permissions: permissionsSchema,
  })
  .strict();

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.rolesService.findById(id);
  }

  @Post()
  @RequirePermission('admin', 'manage_roles')
  @Audit({ action: 'role.created', resource: 'role' })
  async create(
    @Body(new ZodValidationPipe(createRoleSchema))
    dto: { name: string; permissions: Record<string, boolean> },
    @CurrentUser() user: RequestUser,
  ) {
    return this.rolesService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('admin', 'manage_roles')
  @Audit({ action: 'role.updated', resource: 'role', captureBefore: true })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createRoleSchema.partial()))
    dto: Partial<{ name: string; permissions: Record<string, boolean> }>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.rolesService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('admin', 'manage_roles')
  @Audit({ action: 'role.deleted', resource: 'role', captureBefore: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.rolesService.delete(id, user);
  }

  @Post('seed')
  @UseGuards(AdminGuard)
  @RequirePermission('admin', 'manage_roles')
  @Audit({
    action: 'role.defaults_seeded',
    resource: 'role',
    resourceId: () => 'defaults',
  })
  async seedDefaults() {
    await this.rolesService.seedDefaults();
    return { message: 'Default roles seeded' };
  }
}
