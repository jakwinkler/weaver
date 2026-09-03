import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PluginLoaderService } from './plugin-loader.service';
import { matchPluginRoute } from './plugin-route.matcher';

@Injectable()
export class PluginRouteAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly loader: PluginLoaderService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const match = matchPluginRoute(this.loader, request);
    if (match?.route.public) {
      return true;
    }

    return super.canActivate(context);
  }
}
