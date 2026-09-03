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
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { RolesService } from './roles.service';
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
  async create(
    @Body(new ZodValidationPipe(createRoleSchema))
    dto: { name: string; permissions: Record<string, boolean> },
  ) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('admin', 'manage_roles')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createRoleSchema.partial()))
    dto: Partial<{ name: string; permissions: Record<string, boolean> }>,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('admin', 'manage_roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.rolesService.delete(id);
  }

  @Post('seed')
  @RequirePermission('admin', 'manage_roles')
  async seedDefaults() {
    await this.rolesService.seedDefaults();
    return { message: 'Default roles seeded' };
  }
}
