export function assertProductionDataCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.NODE_ENV !== 'production') return;
  for (const name of ['DATABASE_PASSWORD', 'REDIS_PASSWORD']) {
    if (!environment[name] || environment[name] === 'weaver_dev')
      throw new Error(`${name} must be configured in production`);
  }
}
