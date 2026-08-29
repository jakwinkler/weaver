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
import {
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { RolesService } from './roles.service';
import { Audit } from '../audit';

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
    @Body() dto: { name: string; permissions: Record<string, unknown> },
  ) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('admin', 'manage_roles')
  @Audit({ action: 'role.updated', resource: 'role', captureBefore: true })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<{ name: string; permissions: Record<string, unknown> }>,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('admin', 'manage_roles')
  @Audit({ action: 'role.deleted', resource: 'role', captureBefore: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.rolesService.delete(id);
  }

  @Post('seed')
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
