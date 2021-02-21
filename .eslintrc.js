module.exports = {
    env: {
        browser: true,
        es2021: true,
    },
    extends: ['@noeldemartin/eslint-config-typescript'],
    overrides: [
        {
            files: ['scripts/build-types.js'],
            env: { node: true },
            rules: {
                '@typescript-eslint/no-var-requires': 'off',
            },
        },
    ],
    ignorePatterns: ['dist/*'],
};
