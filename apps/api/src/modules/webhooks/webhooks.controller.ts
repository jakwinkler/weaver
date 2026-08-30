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
import { JwtAuthGuard, PermissionGuard, RequirePermission } from '../../core/auth';
import { WebhooksService } from './webhooks.service';
import { Audit } from '../audit';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('admin', 'manage_plugins')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @Audit({ action: 'webhook.created', resource: 'webhook' })
  async create(
    @Body() dto: { url: string; secret: string; events: string[]; projectId?: string },
  ) {
    return this.webhooksService.create(dto);
  }

  @Get()
  async findAll(@Query('projectId') projectId?: string) {
    return this.webhooksService.findAll(projectId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.webhooksService.findById(id);
  }

  @Patch(':id')
  @Audit({ action: 'webhook.updated', resource: 'webhook', captureBefore: true })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<{ url: string; secret: string; events: string[]; active: boolean }>,
  ) {
    return this.webhooksService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'webhook.deleted', resource: 'webhook', captureBefore: true })
  async delete(@Param('id') id: string) {
    await this.webhooksService.delete(id);
  }

  @Get(':id/deliveries')
  async getDeliveries(@Param('id') id: string) {
    return this.webhooksService.getDeliveries(id);
  }

  @Post(':id/test')
  @Audit({ action: 'webhook.tested', resource: 'webhook', captureBefore: true })
  async testDelivery(@Param('id') id: string) {
    return this.webhooksService.deliver(id, 'webhook.test', {
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString(),
    });
  }
}
