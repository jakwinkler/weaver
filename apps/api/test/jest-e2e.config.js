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
};
