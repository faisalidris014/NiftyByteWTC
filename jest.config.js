module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/analytics/**/*.ts',
    'src/skills-engine/logging/**/*.ts',
    'src/offline-queue/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
    '!src/main/**',
    '!src/renderer/**',
    '!src/skills-engine/logging/examples/**',
    '!src/skills-engine/logging/test/**',
    '!src/skills-engine/logging/destinations/**'
  ],
  moduleNameMapper: {
    '^electron$': '<rootDir>/__mocks__/electron.ts'
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
