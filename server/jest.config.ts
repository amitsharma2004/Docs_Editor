import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Replace ioredis with the in-memory mock for all tests
  moduleNameMapper: {
    '^ioredis$': 'ioredis-mock',
  },
  testTimeout: 30000,
  verbose: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/modules/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
};

export default config;
