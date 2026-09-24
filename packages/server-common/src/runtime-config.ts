export function assertRuntimeEnvironment(environment: { NODE_ENV?: string } = process.env): void {
  if (!['development', 'test', 'production'].includes(environment.NODE_ENV ?? '')) {
    throw new Error('NODE_ENV must explicitly be development, test, or production');
  }
}

export function assertProductionDataCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  assertRuntimeEnvironment(environment);
  if (environment.NODE_ENV !== 'production') return;
  for (const name of ['DATABASE_PASSWORD', 'REDIS_PASSWORD']) {
    if (!environment[name] || environment[name] === 'weaver_dev')
      throw new Error(`${name} must be configured in production`);
  }
}
