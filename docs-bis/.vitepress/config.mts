import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: 'Soukai',
    description: 'An RDF-first Solid ORM',
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/img/logo-mini.svg' }]],
    themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        logo: { src: '/img/logo-mini.svg', width: 17, height: 24 },
        search: { provider: 'local' },
        nav: [{ text: 'Guide', link: '/guide/', activeMatch: '/guide/' }],
        sidebar: {
            '/guide/': [
                {
                    text: 'Getting started',
                    items: [{ text: 'Introduction', link: '/guide/' }],
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
