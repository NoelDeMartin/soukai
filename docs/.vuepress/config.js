module.exports = {
    title: 'Soukai ODM',
    description: 'A refreshing javascript library to work with your non relational database',
    themeConfig: {
        repo: 'noeldemartin/soukai',
        docsDir: 'docs',
        editLinks: true,
        nav: [
            {
                text: 'Guide',
                link: '/guide/',
            },
            {
                text: 'API',
                link: 'https://soukai.js.org/api/',
            },
        ],
        sidebar: {
            '/guide/': [
                '',
                'defining-models',
                'using-models',
                'engines',
                'examples',
            ],
        },
    },
};
