if (process.env.WEAVER_IMPORT_TEST_DB === '1') {
  if (!/^weaver_e2e_[a-z0-9_]+$/.test(process.env.WEAVER_IMPORT_DATABASE ?? ''))
    throw new Error('A disposable database name is required');
  Object.assign(process.env, {
    TZ: 'UTC',
    DATABASE_HOST: '127.0.0.1',
    DATABASE_PORT: '55439',
    DATABASE_USER: 'weaver',
    DATABASE_PASSWORD: 'weaver_import_test',
    DATABASE_NAME: process.env.WEAVER_IMPORT_DATABASE,
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '55440',
    STORAGE_DRIVER: 'local',
    IMPORT_CREDENTIAL_KEY: Buffer.alloc(32, 17).toString('base64'),
  });
}
