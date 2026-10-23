// Jest configuration for the backend (plays better with CJS, not ESM)
// Note: This file should have been a .ts extension
const path = require('path');

module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    extensionsToTreatAsEsm: ['.ts'],
    // Configure module resolution to find packages in root node_modules (pnpm hoisting)
    moduleDirectories: ['node_modules', path.join(__dirname, '../../node_modules')],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@config/(.*)\\.js$': '<rootDir>/src/config/$1',
        '^@repositories/(.*)\\.js$': '<rootDir>/src/repositories/$1',
        '^@middleware/(.*)\\.js$': '<rootDir>/src/middleware/$1',
        '^@controller/(.*)\\.js$': '<rootDir>/src/controller/$1',
        '^@routes/(.*)\\.js$': '<rootDir>/src/routes/$1',
        '^@utils/(.*)\\.js$': '<rootDir>/src/utils/$1',
        '^@schemas/(.*)\\.js$': '<rootDir>/src/schemas/$1',
        '^@service/(.*)\\.js$': '<rootDir>/src/service/$1',
        '^@providers/(.*)\\.js$': '<rootDir>/src/providers/$1',
        '^@lib/(.*)\\.js$': '<rootDir>/src/lib/$1',
        '^@errors/(.*)\\.js$': '<rootDir>/src/errors/$1',
        '^@container\\.js$': '<rootDir>/src/container',
        '^@server\\.js$': '<rootDir>/src/server',
        '^@container/(.*)\\.js$': '<rootDir>/src/container/$1',
        '^@test-utils/(.*)\\.js$': '<rootDir>/tests/utils/$1',
        // Map relative imports from routes to container
        '^../container\\.js$': '<rootDir>/src/container.js',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            useESM: true,
            tsconfig: 'tsconfig.test.json',
        }],
    },
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    // Ensure mocks are hoisted properly for ES modules
    transformIgnorePatterns: [],
};

