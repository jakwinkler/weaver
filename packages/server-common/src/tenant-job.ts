export function assertTenantSchemaName(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 63 || !/^tenant_[a-z0-9_]+$/.test(value)) {
    throw new Error('Invalid tenant schema in job');
  }
}
