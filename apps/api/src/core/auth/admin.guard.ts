import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { RequestUser } from './current-user.decorator';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (user?.authMethod === 'apiKey' && !user.apiKeyScopes?.includes('admin')) {
      throw new ForbiddenException('API key requires the admin scope');
    }

    if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
