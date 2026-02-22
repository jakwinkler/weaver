import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

export interface RequiredPermission {
  category: string;
  action: string;
}

export const RequirePermission = (category: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { category, action } as RequiredPermission);
