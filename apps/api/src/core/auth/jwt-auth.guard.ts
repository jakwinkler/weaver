import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { API_KEY_PREFIX } from '@weaver/shared';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class JwtOnlyAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly apiKeyGuard: ApiKeyGuard) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (token?.startsWith(API_KEY_PREFIX)) {
      return this.apiKeyGuard.canActivate(context);
    }

    return super.canActivate(context);
  }
}
