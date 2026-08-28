import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PluginLoaderService } from './plugin-loader.service';

@Controller('plugin-assets')
export class PluginAssetsController {
  constructor(private readonly loader: PluginLoaderService) {}

  @Get('*')
  serveAsset(@Req() req: Request, @Res() res: Response) {
    const marker = '/plugin-assets/';
    const markerIndex = req.path.indexOf(marker);
    const requestPath = markerIndex === -1 ? '' : req.path.slice(markerIndex + marker.length);
    const decodedPath = this.decodeRequestPath(requestPath);
    const pluginId = decodedPath ? this.findPluginId(decodedPath) : undefined;

    if (pluginId) {
      const devServer = this.loader.getPluginDevServerUrl(pluginId);
      if (devServer) {
        const assetPath = decodedPath!.slice(pluginId.length + 1);
        return res.redirect(
          HttpStatus.TEMPORARY_REDIRECT,
          new URL(assetPath, `${devServer}/`).toString(),
        );
      }
    }

    const asset = this.loader.resolveClientAsset(requestPath);
    if (!asset) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Plugin asset not found' });
    }

    if (asset.endsWith('/remoteEntry.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    return res.sendFile(asset);
  }

  private decodeRequestPath(requestPath: string): string | undefined {
    try {
      return requestPath
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .join('/');
    } catch {
      return undefined;
    }
  }

  private findPluginId(decodedPath: string): string | undefined {
    return this.loader
      .getAllManifests()
      .map((manifest) => manifest.id)
      .sort((left, right) => right.length - left.length)
      .find((id) => decodedPath.startsWith(`${id}/`));
  }
}
