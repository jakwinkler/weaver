module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.(spec|test)\\.ts$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
