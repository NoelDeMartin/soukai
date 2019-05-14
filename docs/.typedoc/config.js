module.exports = {
    'external-modulemap': 'src/?(.*)/.*',
    excludeExternals: false,
    excludeNotExported: true,
    excludePrivate: true,
    mode: 'modules',
    name: 'Soukai API',
    out: 'docs/.vuepress/dist/api',
    theme: 'minimal',
    readme: 'docs/.typedoc/index.md',

    // Until the following issue is resolved in typedoc, internal
    // modules have to be ignored:
    // https://github.com/TypeStrong/typedoc/issues/639
    exclude: [
        'src/internal/**',
    ],
};
