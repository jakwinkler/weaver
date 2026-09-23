import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ApiKeyScope } from '@weaver/shared';

export interface RequestUser {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  authMethod?: 'jwt' | 'apiKey';
  apiKeyId?: string;
  apiKeyScopes?: ApiKeyScope[];
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof RequestUser | undefined,
    ctx: ExecutionContext,
  ): RequestUser | RequestUser[keyof RequestUser] => {
    const request = ctx.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (data) {
      return user[data];
    }

    return user;
  },
);
