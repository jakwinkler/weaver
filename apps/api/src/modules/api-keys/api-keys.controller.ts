import { Audit } from '../audit';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createApiKeySchema, type CreateApiKeyDto } from '@weaver/shared';
import { CurrentUser, JwtAuthGuard, type RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { ApiKeysService } from './api-keys.service';

@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @Audit({ action: 'api_key.created', resource: 'api_key' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(user, dto);
  }

  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    return this.apiKeysService.findAll(user);
  }

  @Delete(':id')
  @Audit({ action: 'api_key.deleted', resource: 'api_key' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.apiKeysService.delete(user, id);
  }
}
