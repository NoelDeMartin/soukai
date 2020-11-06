module.exports = {
    testRegex: '\\.test\\.ts$',
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: [
        '<rootDir>/src/**/*',
    ],
    coveragePathIgnorePatterns: [
        '<rootDir>/src/index\.ts',
        '<rootDir>/src/globals\.d\.ts',
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@testing/(.*)$': '<rootDir>/tests/lib/$1',
    },
    moduleFileExtensions: [
        'ts',
        'tsx',
        'js',
        'jsx',
        'json',
        'node',
    ],
};
