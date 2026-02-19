import { AsyncLocalStorage } from 'async_hooks';

export interface TenantInfo {
  tenantId: string;
  schemaName: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantInfo>();

export function getTenantContext(): TenantInfo | undefined {
  return tenantStorage.getStore();
}

export function requireTenantContext(): TenantInfo {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error('Tenant context is not available. Ensure the request has tenant information.');
  }
  return ctx;
}
