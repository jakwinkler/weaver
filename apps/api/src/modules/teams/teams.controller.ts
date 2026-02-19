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
import { JwtAuthGuard } from '../../core/auth';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  async create(@Body() dto: { name: string }) {
    return this.teamsService.create(dto.name);
  }

  @Get()
  async findAll() {
    return this.teamsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() dto: { userId: string },
  ) {
    return this.teamsService.addMember(id, dto.userId);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.teamsService.removeMember(id, userId);
  }

  @Get(':id/members')
  async getMembers(@Param('id') id: string) {
    return this.teamsService.getMembers(id);
  }
}
