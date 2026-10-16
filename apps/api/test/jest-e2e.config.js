// Run in UTC, the deployment runtime, unless WEAVER_E2E_TZ names another zone (test:e2e:zones
// uses that to check the API stores and reads timestamps the same way in any process zone). This
// has to run here, before Jest starts: setupFiles only see a per-file copy of process.env, so a TZ
// assigned there never reaches Node.
process.env.TZ = process.env.WEAVER_E2E_TZ || 'UTC';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  setupFiles: ['<rootDir>/setup.ts'],
  maxWorkers: 1,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.json',
      },
    ],
  },
};
