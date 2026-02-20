import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { updateUserSchema } from '@weaver/shared';
import { JwtAuthGuard, AdminGuard, CurrentUser, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: RequestUser) {
    return this.usersService.findById(user.userId);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: any,
  ) {
    return this.usersService.update(user.userId, dto);
  }

  @Get()
  async listMembers(@CurrentUser() user: RequestUser) {
    return this.usersService.findTenantMembers(user.tenantId);
  }

  @Patch(':userId/role')
  @UseGuards(AdminGuard)
  async updateRole(
    @Param('userId') userId: string,
    @Body() body: { role: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.updateMemberRole(user.tenantId, userId, body.role);
  }
}
