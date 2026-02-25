import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { createProjectSchema, updateProjectSchema } from '@weaver/shared';
import {
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
  CurrentUser,
  RequestUser,
} from '../../core/auth';
import { ZodValidationPipe, parsePagination } from '../../common';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectIssueTypesService } from './project-issue-types.service';
import { ProjectPluginsService } from './project-plugins.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectMembersService: ProjectMembersService,
    private readonly projectIssueTypesService: ProjectIssueTypesService,
    private readonly projectPluginsService: ProjectPluginsService,
  ) {}

  @Post()
  @RequirePermission('projects', 'create')
  async create(
    @Body(new ZodValidationPipe(createProjectSchema)) dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.create(dto, user.userId);
  }

  @Get()
  @RequirePermission('projects', 'read')
  async findAll(@Query() query: any) {
    const params = parsePagination(query);
    return this.projectsService.findAll(params);
  }

  @Get(':key')
  @RequirePermission('projects', 'read')
  async findByKey(@Param('key') key: string) {
    return this.projectsService.findByKey(key);
  }

  @Patch(':key')
  @RequirePermission('projects', 'update')
  async update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) dto: any,
  ) {
    return this.projectsService.update(key, dto);
  }

  @Delete(':key')
  @RequirePermission('projects', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('key') key: string) {
    await this.projectsService.delete(key);
  }

  // ── Project Members ──

  @Get(':key/members')
  @RequirePermission('projects', 'read')
  async getMembers(@Param('key') key: string) {
    const project = await this.projectsService.findByKey(key);
    return this.projectMembersService.findByProject(project.id);
  }

  @Post(':key/members')
  @RequirePermission('projects', 'update')
  async addMember(
    @Param('key') key: string,
    @Body() dto: { userId: string; role?: string },
  ) {
    const project = await this.projectsService.findByKey(key);
    return this.projectMembersService.add(project.id, dto.userId, dto.role);
  }

  @Patch(':key/members/:userId')
  @RequirePermission('projects', 'update')
  async updateMemberRole(
    @Param('key') key: string,
    @Param('userId') userId: string,
    @Body() dto: { role: string },
  ) {
    const project = await this.projectsService.findByKey(key);
    return this.projectMembersService.updateRole(project.id, userId, dto.role);
  }

  @Delete(':key/members/:userId')
  @RequirePermission('projects', 'update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('key') key: string,
    @Param('userId') userId: string,
  ) {
    const project = await this.projectsService.findByKey(key);
    await this.projectMembersService.remove(project.id, userId);
  }

  // ── Project Issue Types ──

  @Get(':key/issue-types')
  @RequirePermission('projects', 'read')
  async getIssueTypes(@Param('key') key: string) {
    const project = await this.projectsService.findByKey(key);
    return this.projectIssueTypesService.findByProject(project.id);
  }

  @Post(':key/issue-types')
  @RequirePermission('projects', 'update')
  async setIssueTypes(
    @Param('key') key: string,
    @Body() dto: { issueTypeIds: string[] },
  ) {
    const project = await this.projectsService.findByKey(key);
    return this.projectIssueTypesService.setForProject(
      project.id,
      dto.issueTypeIds,
    );
  }

  // ── Project Plugins ──

  @Get(':key/plugins')
  @RequirePermission('projects', 'read')
  async getPlugins(@Param('key') key: string) {
    const project = await this.projectsService.findByKey(key);
    return this.projectPluginsService.findByProject(project.id);
  }

  @Post(':key/plugins/enable')
  @RequirePermission('projects', 'update')
  async enablePlugin(
    @Param('key') key: string,
    @Body() dto: { pluginId: string },
  ) {
    const project = await this.projectsService.findByKey(key);
    return this.projectPluginsService.enable(project.id, dto.pluginId);
  }

  @Post(':key/plugins/disable')
  @RequirePermission('projects', 'update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disablePlugin(
    @Param('key') key: string,
    @Body() dto: { pluginId: string },
  ) {
    const project = await this.projectsService.findByKey(key);
    await this.projectPluginsService.disable(project.id, dto.pluginId);
  }
}
