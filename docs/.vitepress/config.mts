import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'Soukai',
    description: 'A JavaScript Active Record library',
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: '/img/logo-mini.svg' }],
        ['meta', { name: 'theme-color', content: '#039be5' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:locale', content: 'en' }],
        ['meta', { property: 'og:title', content: 'Soukai | JavaScript Active Record library' }],
        ['meta', { property: 'og:site_name', content: 'Soukai' }],
        ['meta', { property: 'og:image', content: 'https://soukai.js.org/img/banner.png' }],
        ['meta', { property: 'og:url', content: 'https://soukai.js.org/' }],
    ],
    themeConfig: {
        logo: { src: '/img/logo-mini.svg', width: 17, height: 24 },
        search: { provider: 'local' },
        nav: [{ text: 'Guide', link: '/guide/getting-started/installation', activeMatch: '/guide/' }],
        sidebar: {
            '/guide/': {
                base: '/guide/',
                items: [
                    {
                        text: 'Getting started',
                        base: '/guide/getting-started/',
                        collapsed: true,
                        items: [
                            { text: 'Installation', link: 'installation' },
                            { text: 'Configuration', link: 'configuration' },
                        ],
                    },
                    {
                        text: 'Core concepts',
                        base: '/guide/core-concepts/',
                        collapsed: true,
                        items: [
                            { text: 'Models', link: 'models' },
                            { text: 'Engines', link: 'engines' },
                            { text: 'Relationships', link: 'relationships' },
                        ],
                    },
                    {
                        text: 'Solid Protocol',
                        base: '/guide/solid-protocol/',
                        collapsed: true,
                        items: [
                            { text: 'What is Solid?', link: 'what-is-solid' },
                            { text: 'Solid Models', link: 'solid-models' },
                            { text: 'Limitations', link: 'limitations' },
                        ],
                    },
                    {
                        text: 'Advanced',
                        base: '/guide/advanced/',
                        collapsed: true,
                        items: [
                            { text: 'TypeScript', link: 'typescript' },
                            { text: 'Interoperability', link: 'interoperability' },
                            { text: 'History tracking', link: 'history-tracking' },
                            { text: 'Authorization', link: 'authorization' },
                            { text: 'Observability', link: 'observability' },
                        ],
                    },
                ],
            },
        },
        outline: { level: [2, 3] },
        socialLinks: [{ icon: 'github', link: 'https://github.com/NoelDeMartin/soukai' }],
        footer: {
            message: 'MIT License',
            copyright:
                'Copyright © 2018-present <a href="https://noeldemartin.com" target="_blank">Noel De Martin</a>',
        },
        editLink: {
            pattern: 'https://github.com/noeldemartin/soukai/edit/main/docs/:path',
        },
    },
});
