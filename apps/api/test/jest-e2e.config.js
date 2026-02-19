module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
};
