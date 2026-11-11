import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: 'Soukai',
    description: 'An RDF-first Solid ORM',
    base: '/next/',
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/next/img/logo-mini.svg' }]],
    vite: { server: { port: 5180 } },
    themeConfig: {
        logo: { src: '/img/logo-mini.svg', width: 17, height: 24 },
        search: { provider: 'local' },
        nav: [{ text: 'Guide', link: '/guide/', activeMatch: '/guide/' }],
        sidebar: {
            '/guide/': [
                {
                    text: 'Getting started',
                    items: [
                        { text: 'Introduction', link: '/guide/' },
                        { text: 'Installation', link: '/guide/getting-started/installation' },
                        { text: 'Configuration', link: '/guide/getting-started/configuration' },
                        { text: 'Upgrade Guide', link: '/guide/getting-started/upgrade-guide' },
                    ],
                },
                {
                    text: 'Solid Protocol',
                    base: '/guide/solid-protocol/',
                    items: [
                        { text: 'What is Solid?', link: 'what-is-solid' },
                        { text: 'Mental Model', link: 'mental-model' },
                        { text: 'Limitations', link: 'limitations' },
                    ],
                },
                {
                    text: 'Core concepts',
                    base: '/guide/core-concepts/',
                    items: [
                        { text: 'Models', link: 'models' },
                        { text: 'Engines', link: 'engines' },
                        { text: 'Relations', link: 'relations' },
                    ],
                },
                {
                    text: 'Advanced',
                    base: '/guide/advanced/',
                    collapsed: true,
                    items: [
                        { text: 'Interoperability', link: 'interoperability' },
                        { text: 'Local-first', link: 'local-first' },
                        { text: 'Authorization', link: 'authorization' },
                        { text: 'Observability', link: 'observability' },
                        { text: 'Computed attributes', link: 'computed-attributes' },
                        { text: 'Bag of Tricks', link: 'bag-of-tricks' },
                    ],
                },
                {
                    text: 'Examples',
                    base: '/guide/examples/',
                    collapsed: true,
                    items: [
                        { text: 'Hello World', link: 'hello-world' },
                        { text: 'Hello World (using Solid)', link: 'hello-world-using-solid' },
                        { text: 'Blog', link: 'blog' },
                        { text: 'Tasks Manager (using Solid)', link: 'tasks-manager' },
                        { text: 'Apps', link: 'apps' },
                    ],
                },
            ],
        },
        outline: { level: [2, 3] },
        socialLinks: [{ icon: 'github', link: 'https://github.com/NoelDeMartin/soukai' }],
        footer: {
            message: 'MIT License',
            copyright: 'Copyright © 2018-present <a href="https://noeldemartin.com" target="_blank">Noel De Martin</a>',
        },
        editLink: {
            pattern: 'https://github.com/NoelDeMartin/soukai/edit/main/docs-bis/:path',
        },
    },
});
