import { parseByteRange, type ByteRange } from '@weaver/server-common';
import { pipeline } from 'node:stream/promises';
import {
  Controller,
  Headers,
  Req,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
import {
  JwtAuthGuard,
  CurrentUser,
  RequestUser,
  PermissionGuard,
  RequirePermission,
} from '../../core/auth';
import { AttachmentsService } from './attachments.service';
import { getMaxAttachmentBytes } from './attachment-storage';
import {
  ProjectAccessService,
  TenantConnectionProvider,
  requireTenantContext,
  ProjectAccessGuard,
  RequireProjectAccess,
} from '../../core/tenant';

@Controller('attachments')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class AttachmentDownloadController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly connections: TenantConnectionProvider,
    private readonly access: ProjectAccessService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: getMaxAttachmentBytes() } }),
  )
  @RequirePermission('issues', 'update')
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.upload(file, user.userId);
  }

  @Get(':id/download')
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('attachment-id')
  async download(
    @Param('id') id: string,
    @Res() res: Response,
    @Req() request: Request,
    @Headers('range') rangeHeader?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const attachment = await this.attachmentsService.findById(id);
    const size = Number(attachment.size);
    let range: ByteRange | undefined;
    res.setHeader('Accept-Ranges', 'bytes');
    if (rangeHeader) {
      try {
        range = parseByteRange(rangeHeader, size);
      } catch {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      res.status(206).setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    }
    res.setHeader('Content-Length', range ? range.end - range.start + 1 : size);

    res.attachment(attachment.filename);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });

    if (request.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = await this.attachmentsService.getStream(attachment.storageKey, range);
    let checking = false;
    const recheck = setInterval(() => {
      if (checking) return;
      checking = true;
      void (async () => {
        const em = await this.connections.getEntityManager();
        const { tenantId } = requireTenantContext();
        const [membership] = await em.query(
          'SELECT role FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
          [tenantId, user?.userId],
        );
        if (!membership || !user) throw new Error('Access revoked');
        await this.access.assertAttachmentId(id, { ...user, role: membership.role }, 'read');
      })()
        .catch(() => stream.destroy(new Error('Attachment access revoked')))
        .finally(() => {
          checking = false;
        });
    }, 5000);
    try {
      await pipeline(stream, res);
    } finally {
      clearInterval(recheck);
    }
  }
}
