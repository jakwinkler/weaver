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
import { JwtAuthGuard } from '../../core/auth';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
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
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<{ url: string; secret: string; events: string[]; active: boolean }>,
  ) {
    return this.webhooksService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.webhooksService.delete(id);
  }

  @Get(':id/deliveries')
  async getDeliveries(@Param('id') id: string) {
    return this.webhooksService.getDeliveries(id);
  }

  @Post(':id/test')
  async testDelivery(@Param('id') id: string) {
    return this.webhooksService.deliver(id, 'webhook.test', {
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString(),
    });
  }
}
