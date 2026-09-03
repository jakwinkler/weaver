import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.usersService.uploadAvatar(user.userId, file);
  }

  @Get('search')
  async searchUsers(@Query('q') query: string, @CurrentUser() user: RequestUser) {
    return this.usersService.searchTenantMembers(user.tenantId, query || '');
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
    return this.usersService.updateMemberRole(
      user.tenantId,
      userId,
      body.role,
      user.role,
    );
  }
}
