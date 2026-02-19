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
import { JwtAuthGuard } from '../../core/auth';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard)
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
  async create(
    @Body() dto: { name: string; permissions: Record<string, unknown> },
  ) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<{ name: string; permissions: Record<string, unknown> }>,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.rolesService.delete(id);
  }

  @Post('seed')
  async seedDefaults() {
    await this.rolesService.seedDefaults();
    return { message: 'Default roles seeded' };
  }
}
