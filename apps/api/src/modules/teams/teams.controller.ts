import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  AdminGuard,
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @RequirePermission('admin', 'manage_users')
  async create(@Body() dto: { name: string }) {
    return this.teamsService.create(dto.name);
  }

  @Get()
  @UseGuards(AdminGuard)
  async findAll() {
    return this.teamsService.findAll();
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  async findById(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Delete(':id')
  @RequirePermission('admin', 'manage_users')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.teamsService.delete(id);
  }

  @Post(':id/members')
  @RequirePermission('admin', 'manage_users')
  async addMember(
    @Param('id') id: string,
    @Body() dto: { userId: string },
  ) {
    return this.teamsService.addMember(id, dto.userId);
  }

  @Delete(':id/members/:userId')
  @RequirePermission('admin', 'manage_users')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.teamsService.removeMember(id, userId);
  }

  @Get(':id/members')
  @UseGuards(AdminGuard)
  async getMembers(@Param('id') id: string) {
    return this.teamsService.getMembers(id);
  }
}
