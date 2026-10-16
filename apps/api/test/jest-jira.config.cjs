module.exports = {
  rootDir: '../../..',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/apps/api/test/jira-import-fidelity.e2e-spec.ts',
    '<rootDir>/apps/api/test/jira-import-runtime.e2e-spec.ts',
  ],
  setupFiles: ['<rootDir>/apps/api/test/jira-test-environment.cjs'],
  maxWorkers: 1,
  testTimeout: 60000,
  moduleNameMapper: {
    '^@weaver/jira-import$': '<rootDir>/packages/jira-import/src',
    '^@weaver/db$': '<rootDir>/packages/db/src',
    '^@weaver/shared$': '<rootDir>/packages/shared/src',
    '^supertest$': '<rootDir>/apps/api/test/loopback-supertest.js',
  },
  transform: {
    '^.+\\.ts$': [require.resolve('ts-jest'), { tsconfig: '<rootDir>/apps/api/tsconfig.json' }],
  },
  collectCoverageFrom: [
    'packages/jira-import/src/{import-orchestrator,source-store,field-mapper}.ts',
    'apps/api/src/modules/import/import-people.service.ts',
    'apps/api/src/modules/comments/comments.service.ts',
    'apps/worker/src/processors/import.processor.ts',
    'apps/api/src/modules/import/import.controller.ts',
    'apps/api/src/modules/import/import-invitation.controller.ts',
    'apps/api/src/modules/import/import-source.controller.ts',
    'packages/db/src/migrations/tenant/003-jira-import-fidelity.ts',
    'plugins/plugin-time-reports/src/server/handlers.ts',
  ],
};
